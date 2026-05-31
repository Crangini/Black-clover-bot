import {
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import { logger } from "./lib/logger.js";
import { hasRole, GIVEAWAY_ROLES } from "./utils.js";

const activeGiveaways = new Map();
const endedGiveaways = new Map();

let botClient = null;

export function initGiveaways(client) {
  botClient = client;
}

function parseDuration(input) {
  const clean = input.trim().toLowerCase();
  const regex = /^(?:(\d+)h)?(?:(\d+)m(?:in)?)?(?:(\d+)s(?:ec)?)?$/;
  const match = regex.exec(clean);

  if (!match || (!match[1] && !match[2] && !match[3])) {
    const soloNum = /^(\d+)$/.exec(clean);
    if (soloNum) {
      return parseInt(soloNum[1]) * 60_000;
    }
    return null;
  }

  const h = parseInt(match[1] ?? "0");
  const m = parseInt(match[2] ?? "0");
  const s = parseInt(match[3] ?? "0");
  const ms = h * 3_600_000 + m * 60_000 + s * 1_000;
  return ms > 0 ? ms : null;
}

function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  const parts = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0 || parts.length === 0) parts.push(`${s}s`);
  return parts.join(" ");
}

function buildActiveEmbed(prize, endsAt, participantCount, hostId) {
  const remaining = Math.max(0, endsAt - Date.now());
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("🎉 GIVEAWAY 🎉")
    .setDescription(
      [
        `**Prix :** ${prize}`,
        ``,
        `Réagis avec 🎉 pour participer !`,
        ``,
        `**⏰ Temps restant :** ${formatDuration(remaining)}`,
        `**👥 Participants :** ${participantCount}`,
        `**🎟️ Fin :** <t:${Math.floor(endsAt / 1000)}:R>`,
      ].join("\n"),
    )
    .addFields({ name: "Organisé par", value: `<@${hostId}>`, inline: true })
    .setTimestamp(endsAt);
}

function buildEndedEmbed(prize, winners, hostId) {
  const winnerText =
    winners.length > 0
      ? winners.map((w) => `<@${w}>`).join(", ")
      : "Aucun participant 😢";
  return new EmbedBuilder()
    .setColor(0x95a5a6)
    .setTitle("🎉 GIVEAWAY TERMINÉ 🎉")
    .setDescription(
      [
        `**Prix :** ${prize}`,
        ``,
        `**🏆 Gagnant(s) :** ${winnerText}`,
        ``,
        `*Utilise \`/reroll\` pour reroll ce giveaway.*`,
      ].join("\n"),
    )
    .addFields({ name: "Organisé par", value: `<@${hostId}>`, inline: true })
    .setTimestamp();
}

async function getParticipantIds(giveaway) {
  if (!botClient) return [];
  try {
    const channel = await botClient.channels.fetch(giveaway.channelId);
    if (!channel?.isTextBased()) return [];

    const message = await channel.messages.fetch(giveaway.messageId);
    const reaction = message.reactions.cache.get("🎉");
    if (!reaction) return [];

    const users = await reaction.users.fetch();
    return users.filter((u) => !u.bot).map((u) => u.id);
  } catch (err) {
    logger.error({ err }, "Erreur récupération participants giveaway");
    return [];
  }
}

export async function endGiveaway(messageId) {
  const giveaway = activeGiveaways.get(messageId);
  if (!giveaway || giveaway.ended) return;

  if (giveaway.timer) {
    clearInterval(giveaway.timer);
    giveaway.timer = null;
  }
  if (giveaway.debounceTimer) {
    clearTimeout(giveaway.debounceTimer);
    giveaway.debounceTimer = null;
  }

  giveaway.ended = true;
  activeGiveaways.delete(messageId);

  const participants = await getParticipantIds(giveaway);
  const winners = [];
  if (participants.length > 0) {
    winners.push(participants[Math.floor(Math.random() * participants.length)]);
  }
  giveaway.winners = winners;
  endedGiveaways.set(messageId, giveaway);

  if (!botClient) return;

  try {
    const channel = await botClient.channels.fetch(giveaway.channelId);
    if (!channel?.isTextBased()) return;

    const message = await channel.messages.fetch(messageId);
    await message.edit({
      embeds: [buildEndedEmbed(giveaway.prize, winners, giveaway.hostId)],
    });

    if (winners.length > 0) {
      await channel.send(
        `🎊 Félicitations <@${winners[0]}> ! Tu as gagné **${giveaway.prize}** ! 🎉`,
      );
    } else {
      await channel.send(
        `😢 Le giveaway **${giveaway.prize}** s'est terminé sans participants.`,
      );
    }

    logger.info({ messageId, prize: giveaway.prize, winners }, "Giveaway terminé");
  } catch (err) {
    logger.error({ err, messageId }, "Erreur lors de la fin du giveaway");
  }
}

async function doRefresh(messageId) {
  const giveaway = activeGiveaways.get(messageId);
  if (!giveaway || giveaway.ended || !botClient) return;

  if (Date.now() >= giveaway.endsAt) {
    await endGiveaway(messageId);
    return;
  }

  try {
    const channel = await botClient.channels.fetch(giveaway.channelId);
    if (!channel?.isTextBased()) return;

    const message = await channel.messages.fetch(messageId);
    const reaction = message.reactions.cache.get("🎉");
    const participantCount = reaction ? Math.max(0, reaction.count - 1) : 0;

    if (participantCount === giveaway.lastParticipantCount) return;

    giveaway.lastParticipantCount = participantCount;
    await message.edit({
      embeds: [
        buildActiveEmbed(giveaway.prize, giveaway.endsAt, participantCount, giveaway.hostId),
      ],
    });
  } catch (err) {
    logger.error({ err, messageId }, "Erreur mise à jour embed giveaway");
  }
}

async function refreshParticipantCount(messageId) {
  const giveaway = activeGiveaways.get(messageId);
  if (!giveaway || giveaway.ended) return;

  if (giveaway.debounceTimer) {
    clearTimeout(giveaway.debounceTimer);
  }

  giveaway.debounceTimer = setTimeout(async () => {
    giveaway.debounceTimer = null;
    await doRefresh(messageId);
  }, 400);
}

export function isActiveGiveaway(messageId) {
  return activeGiveaways.has(messageId);
}

export async function onGiveawayReaction(reaction, _user) {
  if (reaction.emoji.name !== "🎉") return;
  const messageId = reaction.message.id;
  if (!activeGiveaways.has(messageId)) return;
  await refreshParticipantCount(messageId);
}

export function getGiveawayCommands() {
  return [
    new SlashCommandBuilder()
      .setName("giveaway")
      .setDescription("🎉 Lancer un giveaway")
      .setDefaultMemberPermissions(0)
      .addStringOption((o) =>
        o.setName("nom").setDescription("Nom / prix du giveaway").setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName("duree")
          .setDescription("Durée : ex. 30s · 10m · 2h · 1h30m (max 100h)")
          .setRequired(true),
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName("giveaway-end")
      .setDescription("⏹️ Terminer le giveaway actif de ce salon immédiatement")
      .setDefaultMemberPermissions(0)
      .toJSON(),
    new SlashCommandBuilder()
      .setName("reroll")
      .setDescription("🔄 Reroll un giveaway terminé")
      .setDefaultMemberPermissions(0)
      .addStringOption((o) =>
        o
          .setName("giveaway")
          .setDescription("Choisir le giveaway à reroll")
          .setRequired(true)
          .setAutocomplete(true),
      )
      .toJSON(),
  ];
}

export async function handleGiveaway(interaction) {
  const member = interaction.member;
  if (!hasRole(member, GIVEAWAY_ROLES)) {
    await interaction.reply({ content: "❌ Tu n'as pas la permission d'utiliser cette commande.", ephemeral: true });
    return;
  }

  const prize = interaction.options.getString("nom", true);
  const dureeInput = interaction.options.getString("duree", true);
  const durationMs = parseDuration(dureeInput);

  if (!durationMs) {
    await interaction.reply({
      content:
        "❌ Format de durée invalide. Exemples valides : `30s`, `10m`, `2h`, `1h30m`, `1h30m20s`",
      ephemeral: true,
    });
    return;
  }

  const maxMs = 100 * 3_600_000;
  if (durationMs > maxMs) {
    await interaction.reply({
      content: "❌ La durée maximale est de **100 heures**.",
      ephemeral: true,
    });
    return;
  }

  const endsAt = Date.now() + durationMs;
  await interaction.deferReply({ ephemeral: true });

  try {
    const channel = interaction.channel;
    const embed = buildActiveEmbed(prize, endsAt, 0, interaction.user.id);
    const message = await channel.send({ embeds: [embed] });
    await message.react("🎉");

    const giveaway = {
      messageId: message.id,
      channelId: channel.id,
      guildId: interaction.guildId ?? "",
      prize,
      endsAt,
      hostId: interaction.user.id,
      ended: false,
      winners: [],
      timer: null,
      lastParticipantCount: 0,
      debounceTimer: null,
    };

    const intervalMs = Math.min(durationMs, 30_000);
    giveaway.timer = setInterval(async () => {
      if (Date.now() >= giveaway.endsAt) {
        await endGiveaway(message.id);
      } else {
        await refreshParticipantCount(message.id);
      }
    }, intervalMs);

    activeGiveaways.set(message.id, giveaway);

    await interaction.editReply({
      content: `✅ Giveaway **${prize}** lancé pour **${formatDuration(durationMs)}** ! Il se terminera <t:${Math.floor(endsAt / 1000)}:R>.`,
    });

    logger.info(
      { messageId: message.id, prize, durationMs, hostId: interaction.user.id },
      "Giveaway créé",
    );
  } catch (err) {
    logger.error({ err }, "Erreur lors du lancement du giveaway");
    await interaction.editReply({
      content: "❌ Une erreur est survenue lors du lancement du giveaway.",
    });
  }
}

export async function handleGiveawayEnd(interaction) {
  const member = interaction.member;
  if (!hasRole(member, GIVEAWAY_ROLES)) {
    await interaction.reply({ content: "❌ Tu n'as pas la permission d'utiliser cette commande.", ephemeral: true });
    return;
  }

  const channelId = interaction.channelId;
  const giveaway = [...activeGiveaways.values()].find(
    (g) => g.channelId === channelId && g.guildId === interaction.guildId,
  );

  if (!giveaway) {
    await interaction.reply({
      content: "❌ Aucun giveaway actif dans ce salon.",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  await endGiveaway(giveaway.messageId);
  await interaction.editReply({
    content: `✅ Giveaway **${giveaway.prize}** terminé !`,
  });
}

export async function handleReroll(interaction) {
  const member = interaction.member;
  if (!hasRole(member, GIVEAWAY_ROLES)) {
    await interaction.reply({ content: "❌ Tu n'as pas la permission d'utiliser cette commande.", ephemeral: true });
    return;
  }

  const messageId = interaction.options.getString("giveaway", true);
  const giveaway = endedGiveaways.get(messageId);

  if (!giveaway) {
    await interaction.reply({
      content: "❌ Giveaway introuvable. Utilise l'autocomplete pour choisir parmi les giveaways terminés.",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const participants = await getParticipantIds(giveaway);
  if (participants.length === 0) {
    await interaction.editReply({ content: "❌ Aucun participant trouvé pour ce giveaway." });
    return;
  }

  const newWinner = participants[Math.floor(Math.random() * participants.length)];
  giveaway.winners = [newWinner];

  try {
    const channel = await interaction.client.channels.fetch(giveaway.channelId);

    if (channel?.isTextBased()) {
      const message = await channel.messages.fetch(messageId).catch(() => null);
      if (message) {
        await message.edit({
          embeds: [buildEndedEmbed(giveaway.prize, [newWinner], giveaway.hostId)],
        });
      }
      await channel.send(
        `🔄 **Reroll !** Nouveau gagnant de **${giveaway.prize}** : <@${newWinner}> ! 🎉`,
      );
    }

    await interaction.editReply({ content: `✅ Reroll effectué ! Nouveau gagnant : <@${newWinner}>` });
    logger.info({ messageId, prize: giveaway.prize, newWinner }, "Giveaway rerollé");
  } catch (err) {
    logger.error({ err, messageId }, "Erreur lors du reroll");
    await interaction.editReply({ content: "❌ Une erreur est survenue lors du reroll." });
  }
}

export function handleGiveawayAutocomplete(interaction) {
  const commandName = interaction.commandName;
  const focusedValue = interaction.options.getFocused().toLowerCase();

  if (commandName === "giveaway-end") {
    const choices = [...activeGiveaways.entries()]
      .filter(
        ([id, g]) =>
          g.guildId === interaction.guildId &&
          (g.prize.toLowerCase().includes(focusedValue) || id.includes(focusedValue)),
      )
      .slice(0, 25)
      .map(([id, g]) => ({
        name: `${g.prize} — se termine <t:${Math.floor(g.endsAt / 1000)}:R>`,
        value: id,
      }));
    interaction.respond(choices).catch(() => null);
    return;
  }

  if (commandName === "reroll") {
    const choices = [...endedGiveaways.entries()]
      .filter(
        ([id, g]) =>
          g.guildId === interaction.guildId &&
          (g.prize.toLowerCase().includes(focusedValue) || id.includes(focusedValue)),
      )
      .slice(0, 25)
      .map(([id, g]) => ({
        name: `${g.prize} (terminé)`,
        value: id,
      }));
    interaction.respond(choices).catch(() => null);
  }
}
