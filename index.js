import {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  TextChannel,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
} from "discord.js";
import { logger } from "./lib/logger.js";
import { tryGiveXp, getUserProgress, getLeaderboard, getUserRank } from "./xp.js";
import { addWarning, getWarnings, removeWarning } from "./warnings.js";
import { hasRole, MOD_ROLES } from "./utils.js";
import {
  initGiveaways,
  getGiveawayCommands,
  handleGiveaway,
  handleGiveawayEnd,
  handleReroll,
  handleGiveawayAutocomplete,
  onGiveawayReaction,
} from "./giveaway.js";

const token = process.env["DISCORD_TOKEN"];
if (!token) {
  logger.warn("DISCORD_TOKEN non défini — le bot Discord ne démarrera pas");
}

const REGLEMENT_CHANNEL_ID = "1510239035782729760";
const REGLEMENT_ROLE_ID = "1510238910481961013";
let reglementMessageId = null;

const LORE_CHANNEL_ID = "1510239036919250974";
const MAP_CHANNEL_ID = "1510239118288752774";
const CLOVER_LORE_CHANNEL_ID = "1510621132099948645";

const pfcGames = new Map();

const TICKET_CHANNEL_ID = "1510239134516514946";
const LEVEL_UP_CHANNEL_ID = "1510274607788331148";
const LEVEL_UP_GIFS = [
  "https://i.pinimg.com/originals/cd/42/90/cd42901add11a576950afcfa4a2e1658.gif",
  "https://i.pinimg.com/originals/4e/b5/f3/4eb5f34e764fb5e0ba96b1ff1f14f9bb.gif",
  "https://i.pinimg.com/originals/3f/5f/af/3f5faf37de98a9720caefbe1bef77a9e.gif",
  "https://i.pinimg.com/originals/e8/0e/88/e80e88b9e2bcc4d6d6e6d78b9a79c1b3.gif",
  "https://i.pinimg.com/originals/6b/5e/53/6b5e5357d1197be474a64dce4ebe4bdb.gif",
  "https://i.pinimg.com/originals/a1/b5/d6/a1b5d6e3a2e8ac1f8e9b9e63de0e12a6.gif",
  "https://media.tenor.com/gPq5FBb4bHUAAAAC/black-clover-asta.gif",
  "https://media.tenor.com/9v6u0z0e5IQAAAAC/black-clover.gif",
  "https://media.tenor.com/XBbHPLgbMQIAAAAC/black-clover-yuno.gif",
];

function randomLevelUpGif() {
  return LEVEL_UP_GIFS[Math.floor(Math.random() * LEVEL_UP_GIFS.length)];
}

const TICKET_CATEGORY_ID = "1510256359361482994";
const LOG_CHANNEL_ID = "1510239011279732848";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildModeration,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

const baseCommands = [
  new SlashCommandBuilder()
    .setName("dice")
    .setDescription("Lance un dé à 6 faces !")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("pfc")
    .setDescription("Pierre Feuille Ciseaux — défie quelqu'un en duel !")
    .addUserOption((o) => o.setName("adversaire").setDescription("Le membre à défier").setRequired(true))
    .toJSON(),
  new SlashCommandBuilder()
    .setName("coinflip")
    .setDescription("Lance une pièce — pile ou face ?")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("8ball")
    .setDescription("Pose une question à la boule magique 🎱")
    .addStringOption((o) => o.setName("question").setDescription("Ta question").setRequired(true))
    .toJSON(),
  new SlashCommandBuilder()
    .setName("hug")
    .setDescription("Fais un câlin à quelqu'un !")
    .addUserOption((option) =>
      option.setName("cible").setDescription("La personne à câliner").setRequired(false),
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("kiss")
    .setDescription("Fais un bisou à quelqu'un !")
    .addUserOption((option) =>
      option.setName("cible").setDescription("La personne à embrasser").setRequired(false),
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("profil")
    .setDescription("Affiche le profil complet d'un membre")
    .addUserOption((option) =>
      option.setName("membre").setDescription("Le membre à inspecter (toi par défaut)").setRequired(false),
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("pat")
    .setDescription("Caresse la tête de quelqu'un !")
    .addUserOption((option) =>
      option.setName("cible").setDescription("La personne à câliner").setRequired(false),
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("niveau")
    .setDescription("Affiche ton niveau et ta progression XP")
    .addUserOption((option) =>
      option.setName("membre").setDescription("Le membre à inspecter (toi par défaut)").setRequired(false),
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("classement")
    .setDescription("Affiche le top 10 des membres les plus actifs")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Expulser un membre du serveur")
    .setDefaultMemberPermissions(0)
    .addUserOption((o) => o.setName("membre").setDescription("Le membre à expulser").setRequired(true))
    .addStringOption((o) => o.setName("raison").setDescription("Raison de l'expulsion").setRequired(false))
    .toJSON(),
  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Bannir un membre du serveur")
    .setDefaultMemberPermissions(0)
    .addUserOption((o) => o.setName("membre").setDescription("Le membre à bannir").setRequired(true))
    .addStringOption((o) => o.setName("raison").setDescription("Raison du ban").setRequired(false))
    .addIntegerOption((o) =>
      o
        .setName("supprimer_messages")
        .setDescription("Supprimer les messages des derniers X jours (0-7)")
        .setRequired(false)
        .setMinValue(0)
        .setMaxValue(7),
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("mute")
    .setDescription("Rendre muet un membre temporairement")
    .setDefaultMemberPermissions(0)
    .addUserOption((o) => o.setName("membre").setDescription("Le membre à mute").setRequired(true))
    .addStringOption((o) =>
      o
        .setName("durée")
        .setDescription("Durée du mute (ex: 5m, 30m, 1h, 12h, 48h — entre 5m et 48h)")
        .setRequired(true),
    )
    .addStringOption((o) => o.setName("raison").setDescription("Raison du mute").setRequired(false))
    .toJSON(),
  new SlashCommandBuilder()
    .setName("lock")
    .setDescription("Verrouiller le salon actuel (personne ne peut écrire)")
    .setDefaultMemberPermissions(0)
    .addStringOption((o) => o.setName("raison").setDescription("Raison du verrouillage").setRequired(false))
    .toJSON(),
  new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("Déverrouiller le salon actuel")
    .setDefaultMemberPermissions(0)
    .addStringOption((o) => o.setName("raison").setDescription("Raison du déverrouillage").setRequired(false))
    .toJSON(),
  new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Supprimer des messages en masse dans ce salon")
    .setDefaultMemberPermissions(0)
    .addIntegerOption((o) =>
      o.setName("nombre").setDescription("Nombre de messages à supprimer (1–100)").setRequired(true).setMinValue(1).setMaxValue(100),
    )
    .addUserOption((o) => o.setName("membre").setDescription("Supprimer uniquement les messages de ce membre").setRequired(false))
    .toJSON(),
  new SlashCommandBuilder()
    .setName("unmute")
    .setDescription("Retirer le mute d'un membre avant la fin")
    .setDefaultMemberPermissions(0)
    .addUserOption((o) => o.setName("membre").setDescription("Le membre à démute").setRequired(true))
    .addStringOption((o) => o.setName("raison").setDescription("Raison du démute").setRequired(false))
    .toJSON(),
  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Avertir un membre")
    .setDefaultMemberPermissions(0)
    .addUserOption((o) => o.setName("membre").setDescription("Le membre à avertir").setRequired(true))
    .addStringOption((o) => o.setName("raison").setDescription("Raison de l'avertissement").setRequired(true))
    .toJSON(),
  new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("Voir les avertissements d'un membre")
    .setDefaultMemberPermissions(0)
    .addUserOption((o) => o.setName("membre").setDescription("Le membre à inspecter").setRequired(true))
    .toJSON(),
  new SlashCommandBuilder()
    .setName("removewarn")
    .setDescription("Supprimer un avertissement d'un membre")
    .setDefaultMemberPermissions(0)
    .addUserOption((o) => o.setName("membre").setDescription("Le membre concerné").setRequired(true))
    .addIntegerOption((o) =>
      o.setName("numero").setDescription("Numéro du warn à supprimer (voir /warnings)").setRequired(true).setMinValue(1),
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("deletefiche")
    .setDescription("Réinitialise la fiche RP d'un membre (staff uniquement)")
    .setDefaultMemberPermissions(0)
    .addUserOption((o) => o.setName("membre").setDescription("Le membre à réinitialiser").setRequired(true))
    .toJSON(),
];

const commands = [...baseCommands, ...getGiveawayCommands()];

let rest;

async function sendLog(embed) {
  try {
    const ch = await client.channels.fetch(LOG_CHANNEL_ID);
    if (!ch?.isTextBased()) return;
    await ch.send({ embeds: [embed] });
  } catch (err) {
    logger.error({ err }, "Erreur lors de l'envoi du log");
  }
}

const FICHE_ROLE_IDS = [
  "1510238701467467888","1510238702859718866","1510238704361275424","1510238705405657189",
  "1510238706248974337","1510238708358578316","1510238709306490910","1510238710430437466",
  "1510238711504441464","1510238713014386830","1510238714796707850","1510238715866513409",
  "1510238717741240503","1510238720110891078","1510238723294363668","1510238724376760521",
  "1510238725634920501","1510238726503137380","1510238727249723394","1510238728411545690",
  "1510238729246212206","1510238730105913445","1510238731079127070",
];
const FICHE_GRADE_IDS = ["1510238735315239005","1510238736418340984","1510238737399939235","1510238738465423522"];
const FICHE_ROYAUME_IDS = ["1510238741694775437","1510238742848344225","1510238744085532782","1510238745633230868","1510238747059552398"];
const FICHE_ESPRIT_ID = "1510238749731328080";
const FICHE_RACE_IDS = ["1510238752574931015","1510238753346556016","1510238754676412427","1510238755875983401","1510238756706193520"];
const FICHE_SEXE_IDS = ["1510238758891421917","1510238760602697819"];
const FICHE_COMPAGNIE_IDS = ["1510238762771152976","1510238763735978134","1510238765585530920","1510238767104000101","1510238768278409276","1510238769402609715","1510238770698518608","1510238771633721514","1510238772766179428"];
const FICHE_GRIMOIRE_IDS = ["1510238775744401429","1510238777061146764","1510238778005127290","1510238779040989185","1510238780567851041","1510238781775810610"];
const FICHE_REMOVE_ROLE = "1510238910481961013";
const FICHE_ADD_ROLE = "1510238909806809098";
const FICHE_DIVIDER_ROLES = ["1510238732354322444","1510238740658786354","1510238748334624939","1510238750867980448","1510238757931057292","1510238761462665409","1510238773626146948","1510238783117983875"];

async function registerCommandsForGuild(guild, appId) {
  try {
    const guildRoles = await guild.roles.fetch();
    const getRoleName = (id) => {
      const r = guildRoles.get(id);
      return r ? r.name.slice(0, 100) : `Rôle ${id}`;
    };
    const makeChoices = (ids) => ids.map((id) => ({ name: getRoleName(id), value: id }));

    const createficheCmd = new SlashCommandBuilder()
      .setName("createfiche")
      .setDescription("Crée une fiche de personnage RP")
      .addUserOption((o) =>
        o.setName("membre").setDescription("Le membre concerné (toi par défaut, staff uniquement pour un autre)").setRequired(false),
      )
      .addStringOption((o) =>
        o.setName("role").setDescription("Le rôle du personnage").setRequired(true).addChoices(...makeChoices(FICHE_ROLE_IDS)),
      )
      .addStringOption((o) =>
        o.setName("grade").setDescription("Le grade de ton personnage").setRequired(true).addChoices(...makeChoices(FICHE_GRADE_IDS)),
      )
      .addStringOption((o) =>
        o.setName("royaume").setDescription("Le royaume de ton personnage").setRequired(true).addChoices(...makeChoices(FICHE_ROYAUME_IDS)),
      )
      .addStringOption((o) =>
        o.setName("race").setDescription("La race de ton personnage").setRequired(true).addChoices(...makeChoices(FICHE_RACE_IDS)),
      )
      .addStringOption((o) =>
        o.setName("sexe").setDescription("Le sexe de ton personnage").setRequired(true).addChoices(...makeChoices(FICHE_SEXE_IDS)),
      )
      .addStringOption((o) =>
        o.setName("esprit").setDescription("L'esprit de ton personnage (optionnel)").setRequired(false).addChoices({ name: getRoleName(FICHE_ESPRIT_ID), value: FICHE_ESPRIT_ID }),
      )
      .addStringOption((o) =>
        o.setName("compagnie").setDescription("Ta compagnie de Chevaliers-Mages (optionnel)").setRequired(false).addChoices(...makeChoices(FICHE_COMPAGNIE_IDS)),
      )
      .addStringOption((o) =>
        o.setName("grimoire").setDescription("Le type de grimoire de ton personnage (optionnel)").setRequired(false).addChoices(...makeChoices(FICHE_GRIMOIRE_IDS)),
      )
      .toJSON();

    await rest.put(Routes.applicationGuildCommands(appId, guild.id), { body: [...commands, createficheCmd] });
    logger.info({ guildId: guild.id, guildName: guild.name }, "Commandes slash enregistrées");
  } catch (err) {
    logger.error({ err, guildId: guild.id }, "Erreur lors de l'enregistrement des commandes");
  }
}

client.once("clientReady", async (c) => {
  logger.info({ tag: c.user.tag, at: new Date().toISOString() }, "✅ Bot Discord connecté");
  rest = new REST({ version: "10" }).setToken(token);
  initGiveaways(c);
  for (const guild of c.guilds.cache.values()) {
    await registerCommandsForGuild(guild, c.user.id);
  }
  await postReglement();
  await postLore();
  await postKingdomMap();
  await postCloverLore();
  await postTicketEmbed();
});

client.on("disconnect", () => {
  logger.warn({ at: new Date().toISOString() }, "⚠️ Bot déconnecté de Discord");
});

client.on("reconnecting", () => {
  logger.info({ at: new Date().toISOString() }, "🔄 Bot en cours de reconnexion...");
});

client.on("error", (err) => {
  logger.error({ err, at: new Date().toISOString() }, "❌ Erreur client Discord");
});

client.on("warn", (info) => {
  logger.warn({ info, at: new Date().toISOString() }, "⚠️ Avertissement Discord");
});

client.on("guildCreate", async (guild) => {
  logger.info({ guildId: guild.id, guildName: guild.name }, "Bot rejoint un nouveau serveur");
  if (rest && client.user) {
    await registerCommandsForGuild(guild, client.user.id);
  }
});

client.on("guildMemberAdd", async (member) => {
  const guild = member.guild;
  const WELCOME_CHANNEL_ID = "1510239032775413952";
  let welcomeChannel;

  try {
    const fetched = await guild.channels.fetch(WELCOME_CHANNEL_ID);
    if (fetched?.isTextBased()) welcomeChannel = fetched;
  } catch {
    logger.warn({ guildId: guild.id, WELCOME_CHANNEL_ID }, "Impossible de récupérer le salon de bienvenue");
  }

  if (!welcomeChannel) {
    logger.warn({ guildId: guild.id }, "Salon de bienvenue introuvable");
    return;
  }

  try {
    await member.roles.add("1510238919445450772");
    logger.info({ guildId: guild.id, userId: member.id }, "Rôle automatique attribué");
  } catch (err) {
    logger.error({ err, guildId: guild.id }, "Erreur lors de l'attribution du rôle automatique");
  }

  const memberCount = guild.memberCount;
  const embed = new EmbedBuilder()
    .setColor(0xff79c6)
    .setTitle("✨ Nouveau membre !")
    .setDescription(
      `Bienvenue sur **${guild.name}** ${member} amuse toi bien sur notre serveur ! Hésite pas si t'as besoin de quoi que ce soit ! On est **${memberCount}** membres !`,
    )
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .setImage("https://i.pinimg.com/originals/96/7a/b8/967ab8bf7c362df5554745dc216f688f.gif")
    .setFooter({ text: `Bienvenue dans la famille 💖` })
    .setTimestamp();

  try {
    await welcomeChannel.send({ embeds: [embed] });
    logger.info({ guildId: guild.id, userId: member.id }, "Message de bienvenue envoyé");
  } catch (err) {
    logger.error({ err, guildId: guild.id }, "Erreur lors de l'envoi du message de bienvenue");
  }

  await sendLog(
    new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("📥 Membre rejoint")
      .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: "Membre", value: `${member} (${member.user.tag})`, inline: true },
        { name: "ID", value: member.id, inline: true },
        {
          name: "Compte créé le",
          value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:D>`,
          inline: false,
        },
      )
      .setFooter({ text: `${guild.memberCount} membres au total` })
      .setTimestamp(),
  );
});

client.on("interactionCreate", async (interaction) => {
  if (interaction.isAutocomplete()) {
    if (interaction.commandName === "reroll") {
      handleGiveawayAutocomplete(interaction);
    }
    return;
  }

  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === "ticket_select") {
      await handleTicketSelect(interaction);
    }
    return;
  }

  if (interaction.isButton()) {
    if (interaction.customId.startsWith("pfc_")) {
      await handlePfcButton(interaction);
      return;
    }
    if (interaction.customId.startsWith("map_kingdom_")) {
      await handleMapButton(interaction);
      return;
    }
    if (interaction.customId === "ticket_close") {
      await handleCloseTicket(interaction);
    } else if (interaction.customId === "ticket_close_confirm") {
      const ch = interaction.channel;
      await sendLog(
        new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle("🔒 Ticket fermé")
          .addFields(
            {
              name: "Salon",
              value: (ch && "name" in ch ? ch.name : null) ?? "inconnu",
              inline: true,
            },
            {
              name: "Fermé par",
              value: `${interaction.user} (${interaction.user.tag})`,
              inline: true,
            },
          )
          .setTimestamp(),
      );
      await ch?.delete().catch(() => null);
    } else if (interaction.customId === "ticket_close_cancel") {
      await interaction.update({
        content: "❌ Fermeture annulée.",
        embeds: [],
        components: [],
      });
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "dice") {
    await handleDice(interaction);
  } else if (interaction.commandName === "pfc") {
    await handlePfc(interaction);
  } else if (interaction.commandName === "coinflip") {
    await handleCoinflip(interaction);
  } else if (interaction.commandName === "8ball") {
    await handle8ball(interaction);
  } else if (interaction.commandName === "hug") {
    await handleHug(interaction);
  } else if (interaction.commandName === "kiss") {
    await handleKiss(interaction);
  } else if (interaction.commandName === "profil") {
    await handleProfil(interaction);
  } else if (interaction.commandName === "pat") {
    await handlePat(interaction);
  } else if (interaction.commandName === "niveau") {
    await handleNiveau(interaction);
  } else if (interaction.commandName === "classement") {
    await handleClassement(interaction);
  } else if (interaction.commandName === "giveaway") {
    await handleGiveaway(interaction);
  } else if (interaction.commandName === "giveaway-end") {
    await handleGiveawayEnd(interaction);
  } else if (interaction.commandName === "reroll") {
    await handleReroll(interaction);
  } else if (interaction.commandName === "lock") {
    await handleLock(interaction);
  } else if (interaction.commandName === "unlock") {
    await handleUnlock(interaction);
  } else if (interaction.commandName === "clear") {
    await handleClear(interaction);
  } else if (interaction.commandName === "kick") {
    await handleKick(interaction);
  } else if (interaction.commandName === "ban") {
    await handleBan(interaction);
  } else if (interaction.commandName === "mute") {
    await handleMute(interaction);
  } else if (interaction.commandName === "unmute") {
    await handleUnmute(interaction);
  } else if (interaction.commandName === "warn") {
    await handleWarn(interaction);
  } else if (interaction.commandName === "warnings") {
    await handleWarnings(interaction);
  } else if (interaction.commandName === "removewarn") {
    await handleSupprimerWarn(interaction);
  } else if (interaction.commandName === "createfiche") {
    await handleCreatefiche(interaction);
  } else if (interaction.commandName === "deletefiche") {
    await handleDeletefiche(interaction);
  }
});

async function handleDeletefiche(interaction) {
  const guild = interaction.guild;
  if (!guild) return;

  if (!hasRole(interaction.member, MOD_ROLES)) {
    await interaction.reply({ content: "❌ Tu n'as pas la permission d'utiliser cette commande.", ephemeral: true });
    return;
  }

  const targetUser = interaction.options.getUser("membre");
  const member = await guild.members.fetch(targetUser.id).catch(() => null);
  if (!member) {
    await interaction.reply({ content: "❌ Membre introuvable.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const allFicheRoles = [
    ...FICHE_ROLE_IDS,
    ...FICHE_GRADE_IDS,
    ...FICHE_ROYAUME_IDS,
    FICHE_ESPRIT_ID,
    ...FICHE_RACE_IDS,
    ...FICHE_SEXE_IDS,
    ...FICHE_COMPAGNIE_IDS,
    ...FICHE_GRIMOIRE_IDS,
    ...FICHE_DIVIDER_ROLES,
    FICHE_ADD_ROLE,
  ];

  let removed = 0;
  for (const id of allFicheRoles) {
    if (member.roles.cache.has(id)) {
      try {
        await member.roles.remove(id);
        removed++;
      } catch {}
    }
  }

  try {
    await member.roles.add(FICHE_REMOVE_ROLE);
  } catch {}

  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle("🗑️ Fiche réinitialisée")
    .setDescription(`La fiche RP de <@${targetUser.id}> a été supprimée.\n**${removed}** rôle(s) retiré(s). Le rôle de départ a été ré-attribué.`)
    .setFooter({ text: `Par ${interaction.user.username}` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });

  await sendLog(
    new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle("🗑️ Fiche RP supprimée")
      .addFields(
        { name: "Membre", value: `<@${targetUser.id}> (${targetUser.tag})`, inline: true },
        { name: "Staff", value: `<@${interaction.user.id}>`, inline: true },
        { name: "Rôles retirés", value: `${removed}`, inline: true },
      )
      .setTimestamp(),
  );
}

async function handleCreatefiche(interaction) {
  const guild = interaction.guild;
  if (!guild) return;

  await interaction.deferReply({ ephemeral: true });

  const targetUser = interaction.options.getUser("membre");
  const isForOther = targetUser && targetUser.id !== interaction.user.id;

  if (isForOther && !hasRole(interaction.member, MOD_ROLES)) {
    await interaction.editReply({ content: "❌ Seul le staff peut créer une fiche pour quelqu'un d'autre." });
    return;
  }

  const memberId = targetUser ? targetUser.id : interaction.user.id;
  const member = await guild.members.fetch(memberId).catch(() => null);
  if (!member) {
    await interaction.editReply({ content: "❌ Impossible de récupérer ce membre." });
    return;
  }

  const roleId = interaction.options.getString("role");
  const gradeId = interaction.options.getString("grade");
  const royaumeId = interaction.options.getString("royaume");
  const raceId = interaction.options.getString("race");
  const sexeId = interaction.options.getString("sexe");
  const espritId = interaction.options.getString("esprit");
  const compagnieId = interaction.options.getString("compagnie");
  const grimoireId = interaction.options.getString("grimoire");

  const rolesToAdd = [roleId, gradeId, royaumeId, raceId, sexeId, ...FICHE_DIVIDER_ROLES];
  if (espritId) rolesToAdd.push(espritId);
  if (compagnieId) rolesToAdd.push(compagnieId);
  if (grimoireId) rolesToAdd.push(grimoireId);
  rolesToAdd.push(FICHE_ADD_ROLE);

  const errors = [];

  for (const id of rolesToAdd) {
    try {
      await member.roles.add(id);
    } catch {
      errors.push(id);
    }
  }

  try {
    await member.roles.remove(FICHE_REMOVE_ROLE);
  } catch {}

  const guildRoles = await guild.roles.fetch();
  const getName = (id) => guildRoles.get(id)?.name ?? id;

  const displayUser = targetUser ?? interaction.user;
  const embed = new EmbedBuilder()
    .setColor(0xd4a017)
    .setTitle("✨ Fiche de personnage créée !")
    .setThumbnail(displayUser.displayAvatarURL({ size: 128 }))
    .setDescription(
      isForOther
        ? `La fiche de <@${displayUser.id}> a été créée avec succès par <@${interaction.user.id}>.`
        : "Tes rôles ont été attribués avec succès. Bienvenue dans la Golden Era !",
    )
    .addFields(
      { name: "⚔️ Rôle", value: `<@&${roleId}>`, inline: true },
      { name: "🎖️ Grade", value: `<@&${gradeId}>`, inline: true },
      { name: "🏰 Royaume", value: `<@&${royaumeId}>`, inline: true },
      { name: "🧬 Race", value: `<@&${raceId}>`, inline: true },
      { name: "🚻 Sexe", value: `<@&${sexeId}>`, inline: true },
      ...(espritId ? [{ name: "🌊 Esprit", value: `<@&${espritId}>`, inline: true }] : []),
      ...(compagnieId ? [{ name: "🛡️ Compagnie", value: `<@&${compagnieId}>`, inline: true }] : []),
      ...(grimoireId ? [{ name: "📖 Grimoire", value: `<@&${grimoireId}>`, inline: true }] : []),
    )
    .setFooter({ text: "Black Clover RP — Golden Era 🍀" })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

async function handleLock(interaction) {
  if (!hasRole(interaction.member, MOD_ROLES)) {
    await interaction.reply({ content: "❌ Tu n'as pas la permission d'utiliser cette commande.", ephemeral: true });
    return;
  }

  const raison = interaction.options.getString("raison") ?? "Aucune raison fournie";
  const channel = interaction.channel;
  if (!channel?.isTextBased() || channel.isDMBased()) return;

  try {
    await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
      SendMessages: false,
    });

    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle("🔒 Salon verrouillé")
      .setDescription(`Ce salon a été verrouillé. Personne ne peut écrire jusqu'au déverrouillage.`)
      .addFields(
        { name: "Modérateur", value: `${interaction.user} (${interaction.user.tag})`, inline: false },
        { name: "Raison", value: raison, inline: false },
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
    await sendLog(
      new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle("🔒 Salon verrouillé")
        .addFields(
          { name: "Salon", value: `${channel}`, inline: true },
          { name: "Modérateur", value: `${interaction.user} (${interaction.user.tag})`, inline: false },
          { name: "Raison", value: raison, inline: false },
        )
        .setTimestamp(),
    );
    logger.info({ channelId: channel.id, modId: interaction.user.id, raison }, "Salon verrouillé");
  } catch (err) {
    logger.error({ err }, "Erreur lors du lock");
    await interaction.reply({ content: "❌ Une erreur est survenue lors du verrouillage.", ephemeral: true });
  }
}

async function handleUnlock(interaction) {
  if (!hasRole(interaction.member, MOD_ROLES)) {
    await interaction.reply({ content: "❌ Tu n'as pas la permission d'utiliser cette commande.", ephemeral: true });
    return;
  }

  const raison = interaction.options.getString("raison") ?? "Aucune raison fournie";
  const channel = interaction.channel;
  if (!channel?.isTextBased() || channel.isDMBased()) return;

  try {
    await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
      SendMessages: null,
    });

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("🔓 Salon déverrouillé")
      .setDescription(`Ce salon est à nouveau ouvert. Tout le monde peut écrire.`)
      .addFields(
        { name: "Modérateur", value: `${interaction.user} (${interaction.user.tag})`, inline: false },
        { name: "Raison", value: raison, inline: false },
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
    await sendLog(
      new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle("🔓 Salon déverrouillé")
        .addFields(
          { name: "Salon", value: `${channel}`, inline: true },
          { name: "Modérateur", value: `${interaction.user} (${interaction.user.tag})`, inline: false },
          { name: "Raison", value: raison, inline: false },
        )
        .setTimestamp(),
    );
    logger.info({ channelId: channel.id, modId: interaction.user.id, raison }, "Salon déverrouillé");
  } catch (err) {
    logger.error({ err }, "Erreur lors du unlock");
    await interaction.reply({ content: "❌ Une erreur est survenue lors du déverrouillage.", ephemeral: true });
  }
}

async function handleClear(interaction) {
  if (!hasRole(interaction.member, MOD_ROLES)) {
    await interaction.reply({ content: "❌ Tu n'as pas la permission d'utiliser cette commande.", ephemeral: true });
    return;
  }

  const nombre = interaction.options.getInteger("nombre", true);
  const targetUser = interaction.options.getUser("membre");
  const channel = interaction.channel;
  if (!channel?.isTextBased()) return;

  await interaction.deferReply({ ephemeral: true });

  try {
    let messages = await channel.messages.fetch({ limit: 100 });

    if (targetUser) {
      messages = messages.filter((m) => m.author.id === targetUser.id);
    }

    const toDelete = [...messages.values()].slice(0, nombre);

    if (toDelete.length === 0) {
      await interaction.editReply({ content: "❌ Aucun message trouvé à supprimer." });
      return;
    }

    const deleted = await channel.bulkDelete(toDelete, true);

    const embed = new EmbedBuilder()
      .setColor(0x3b82f6)
      .setTitle("🗑️ Messages supprimés")
      .addFields(
        { name: "Salon", value: `${channel}`, inline: true },
        { name: "Supprimés", value: `${deleted.size}`, inline: true },
        { name: "Modérateur", value: `${interaction.user} (${interaction.user.tag})`, inline: false },
        ...(targetUser ? [{ name: "Filtre membre", value: `${targetUser} (${targetUser.tag})`, inline: false }] : []),
      )
      .setFooter({ text: "Les messages de plus de 14 jours ne peuvent pas être supprimés." })
      .setTimestamp();

    await interaction.editReply({ content: `✅ **${deleted.size}** message(s) supprimé(s).` });
    await sendLog(embed);
    logger.info({ channelId: channel.id, modId: interaction.user.id, deleted: deleted.size }, "Clear effectué");
  } catch (err) {
    logger.error({ err }, "Erreur lors du clear");
    await interaction.editReply({ content: "❌ Une erreur est survenue. Les messages de plus de 14 jours ne peuvent pas être supprimés en masse." });
  }
}

async function handleKick(interaction) {
  const member = interaction.member;
  if (!hasRole(member, MOD_ROLES)) {
    await interaction.reply({ content: "❌ Tu n'as pas la permission d'utiliser cette commande.", ephemeral: true });
    return;
  }

  const targetUser = interaction.options.getUser("membre", true);
  const raison = interaction.options.getString("raison") ?? "Aucune raison fournie";
  const guild = interaction.guild;
  if (!guild) return;

  let target;
  try {
    target = await guild.members.fetch(targetUser.id);
  } catch {
    await interaction.reply({ content: "❌ Impossible de trouver ce membre.", ephemeral: true });
    return;
  }

  if (!target.kickable) {
    await interaction.reply({
      content: "❌ Je ne peux pas expulser ce membre (rôle trop élevé ou protégé).",
      ephemeral: true,
    });
    return;
  }

  if (target.id === interaction.user.id) {
    await interaction.reply({ content: "❌ Tu ne peux pas t'expulser toi-même.", ephemeral: true });
    return;
  }

  try {
    await target.kick(raison);
    const embed = new EmbedBuilder()
      .setColor(0xffa500)
      .setTitle("👢 Membre expulsé")
      .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: "Membre", value: `${targetUser} (${targetUser.tag})`, inline: true },
        { name: "ID", value: targetUser.id, inline: true },
        { name: "Modérateur", value: `${interaction.user} (${interaction.user.tag})`, inline: false },
        { name: "Raison", value: raison, inline: false },
      )
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
    await sendLog(embed);
    logger.info({ targetId: targetUser.id, modId: interaction.user.id, raison }, "Membre expulsé");
  } catch (err) {
    logger.error({ err }, "Erreur lors du kick");
    await interaction.reply({ content: "❌ Une erreur est survenue lors de l'expulsion.", ephemeral: true });
  }
}

async function handleBan(interaction) {
  const member = interaction.member;
  if (!hasRole(member, MOD_ROLES)) {
    await interaction.reply({ content: "❌ Tu n'as pas la permission d'utiliser cette commande.", ephemeral: true });
    return;
  }

  const targetUser = interaction.options.getUser("membre", true);
  const raison = interaction.options.getString("raison") ?? "Aucune raison fournie";
  const deleteMessageDays = interaction.options.getInteger("supprimer_messages") ?? 0;
  const guild = interaction.guild;
  if (!guild) return;

  let target = null;
  try {
    target = await guild.members.fetch(targetUser.id);
  } catch {
    target = null;
  }

  if (target && !target.bannable) {
    await interaction.reply({
      content: "❌ Je ne peux pas bannir ce membre (rôle trop élevé ou protégé).",
      ephemeral: true,
    });
    return;
  }

  if (targetUser.id === interaction.user.id) {
    await interaction.reply({ content: "❌ Tu ne peux pas te bannir toi-même.", ephemeral: true });
    return;
  }

  try {
    await guild.members.ban(targetUser.id, { reason: raison, deleteMessageSeconds: deleteMessageDays * 86400 });
    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle("🔨 Membre banni")
      .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: "Membre", value: `${targetUser} (${targetUser.tag})`, inline: true },
        { name: "ID", value: targetUser.id, inline: true },
        { name: "Modérateur", value: `${interaction.user} (${interaction.user.tag})`, inline: false },
        { name: "Raison", value: raison, inline: false },
        {
          name: "Messages supprimés",
          value: deleteMessageDays > 0 ? `${deleteMessageDays} jour(s)` : "Aucun",
          inline: true,
        },
      )
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
    await sendLog(embed);
    logger.info({ targetId: targetUser.id, modId: interaction.user.id, raison, deleteMessageDays }, "Membre banni");
  } catch (err) {
    logger.error({ err }, "Erreur lors du ban");
    await interaction.reply({ content: "❌ Une erreur est survenue lors du ban.", ephemeral: true });
  }
}

async function fetchAnimeGif(action) {
  try {
    const res = await fetch(`https://nekos.best/api/v2/${action}`);
    const data = await res.json();
    return data.results[0].url;
  } catch (err) {
    logger.error({ err, action }, "Erreur lors de la récupération du GIF");
    return "";
  }
}

async function handleDice(interaction) {
  const result = Math.floor(Math.random() * 6) + 1;
  const faces6 = ["⚀","⚁","⚂","⚃","⚄","⚅"];

  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle("🎲 Lancer de dé !")
    .setDescription(`${faces6[result - 1]}\n\n# ${result}`)
    .setFooter({ text: result === 6 ? "🎉 Maximum !" : result === 1 ? "💀 Minimum…" : "Bonne chance !" })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handlePfc(interaction) {
  const challenger = interaction.user;
  const opponent = interaction.options.getUser("adversaire", true);

  if (opponent.id === challenger.id) {
    await interaction.reply({ content: "❌ Tu ne peux pas te défier toi-même !", ephemeral: true });
    return;
  }
  if (opponent.bot) {
    await interaction.reply({ content: "❌ Tu ne peux pas défier un bot !", ephemeral: true });
    return;
  }

  const gameId = `${challenger.id}_${Date.now()}`;
  pfcGames.set(gameId, {
    challengerId: challenger.id,
    opponentId: opponent.id,
    challengerChoice: null,
    opponentChoice: null,
    phase: "invite",
  });

  setTimeout(() => pfcGames.delete(gameId), 5 * 60 * 1000);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`pfc_accept_${gameId}`).setLabel("✅ Accepter").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`pfc_decline_${gameId}`).setLabel("❌ Refuser").setStyle(ButtonStyle.Danger),
  );

  const embed = new EmbedBuilder()
    .setColor(0x3b82f6)
    .setTitle("🪨📄✂️ Pierre Feuille Ciseaux !")
    .setDescription(`${challenger} défie ${opponent} en duel !\n\n${opponent}, acceptes-tu le défi ?`)
    .setFooter({ text: "L'invitation expire dans 5 minutes." })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], components: [row] });
}

async function handlePfcButton(interaction) {
  const parts = interaction.customId.split("_");
  const action = parts[1];
  const gameId = parts.slice(2).join("_");
  const game = pfcGames.get(gameId);

  if (!game) {
    await interaction.reply({ content: "❌ Cette partie a expiré ou n'existe plus.", ephemeral: true });
    return;
  }

  if (action === "accept" || action === "decline") {
    if (interaction.user.id !== game.opponentId) {
      await interaction.reply({ content: "❌ Seul l'adversaire peut accepter ou refuser.", ephemeral: true });
      return;
    }

    if (action === "decline") {
      pfcGames.delete(gameId);
      await interaction.update({
        embeds: [
          new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle("🪨📄✂️ Défi refusé")
            .setDescription(`<@${game.opponentId}> a refusé le défi de <@${game.challengerId}>.`)
            .setTimestamp(),
        ],
        components: [],
      });
      return;
    }

    game.phase = "playing";

    const choiceRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`pfc_rock_${gameId}`).setLabel("🪨 Pierre").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`pfc_paper_${gameId}`).setLabel("📄 Feuille").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`pfc_scissors_${gameId}`).setLabel("✂️ Ciseaux").setStyle(ButtonStyle.Secondary),
    );

    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setColor(0xf1c40f)
          .setTitle("🪨📄✂️ La partie commence !")
          .setDescription(
            `<@${game.challengerId}> VS <@${game.opponentId}>\n\nChacun choisit son arme ! Vos choix sont secrets jusqu'à la révélation. 🤫`,
          )
          .addFields(
            { name: `<@${game.challengerId}>`, value: "⏳ En attente...", inline: true },
            { name: `<@${game.opponentId}>`, value: "⏳ En attente...", inline: true },
          )
          .setTimestamp(),
      ],
      components: [choiceRow],
    });
    return;
  }

  if (action === "rock" || action === "paper" || action === "scissors") {
    if (game.phase !== "playing") return;

    const isChallenger = interaction.user.id === game.challengerId;
    const isOpponent = interaction.user.id === game.opponentId;

    if (!isChallenger && !isOpponent) {
      await interaction.reply({ content: "❌ Tu ne participes pas à cette partie !", ephemeral: true });
      return;
    }

    const choiceLabel = { rock: "🪨 Pierre", paper: "📄 Feuille", scissors: "✂️ Ciseaux" };

    if (isChallenger) {
      if (game.challengerChoice) {
        await interaction.reply({ content: "✅ Tu as déjà fait ton choix !", ephemeral: true });
        return;
      }
      game.challengerChoice = action;
    } else {
      if (game.opponentChoice) {
        await interaction.reply({ content: "✅ Tu as déjà fait ton choix !", ephemeral: true });
        return;
      }
      game.opponentChoice = action;
    }

    await interaction.reply({ content: `✅ Tu as choisi **${choiceLabel[action]}** ! En attente de l'adversaire…`, ephemeral: true });

    if (!game.challengerChoice || !game.opponentChoice) return;

    pfcGames.delete(gameId);

    const c = game.challengerChoice;
    const o = game.opponentChoice;
    const wins = { rock: "scissors", paper: "rock", scissors: "paper" };

    let resultText;
    let color;
    if (c === o) {
      resultText = "🤝 **Égalité !** Personne ne gagne !";
      color = 0xfee75c;
    } else if (wins[c] === o) {
      resultText = `🏆 **<@${game.challengerId}> gagne !**`;
      color = 0x57f287;
    } else {
      resultText = `🏆 **<@${game.opponentId}> gagne !**`;
      color = 0x57f287;
    }

    const resultEmbed = new EmbedBuilder()
      .setColor(color)
      .setTitle("🪨📄✂️ Résultat !")
      .setDescription(resultText)
      .addFields(
        { name: `<@${game.challengerId}>`, value: choiceLabel[c], inline: true },
        { name: "VS", value: "⚔️", inline: true },
        { name: `<@${game.opponentId}>`, value: choiceLabel[o], inline: true },
      )
      .setTimestamp();

    await interaction.message.edit({ embeds: [resultEmbed], components: [] });
  }
}

async function handleCoinflip(interaction) {
  const pile = Math.random() < 0.5;
  const embed = new EmbedBuilder()
    .setColor(pile ? 0xf1c40f : 0x95a5a6)
    .setTitle("🪙 Pile ou Face ?")
    .setDescription(pile ? "# 🟡 PILE !" : "# ⚪ FACE !")
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handle8ball(interaction) {
  const question = interaction.options.getString("question", true);
  const reponses = [
    { text: "Absolument oui ! ✨", color: 0x57f287 },
    { text: "C'est certain. 💪", color: 0x57f287 },
    { text: "Sans aucun doute. 🍀", color: 0x57f287 },
    { text: "Oui, définitivement. 🔮", color: 0x57f287 },
    { text: "Tu peux compter dessus. ⭐", color: 0x57f287 },
    { text: "Les signes sont favorables. 🌟", color: 0x57f287 },
    { text: "La réponse est floue… Réessaie. 🌀", color: 0xfee75c },
    { text: "Mieux vaut ne pas te le dire maintenant. 🤔", color: 0xfee75c },
    { text: "Impossible à prédire. 🌫️", color: 0xfee75c },
    { text: "Concentre-toi et redemande. 🧘", color: 0xfee75c },
    { text: "Non, pas vraiment. ❌", color: 0xed4245 },
    { text: "Ma réponse est non. 🚫", color: 0xed4245 },
    { text: "Les perspectives ne sont pas bonnes. 😬", color: 0xed4245 },
    { text: "N'y compte pas. 💀", color: 0xed4245 },
    { text: "Très douteux. 😶", color: 0xed4245 },
  ];

  const choix = reponses[Math.floor(Math.random() * reponses.length)];

  const embed = new EmbedBuilder()
    .setColor(choix.color)
    .setTitle("🎱 La Boule Magique")
    .addFields(
      { name: "Ta question", value: `*${question}*`, inline: false },
      { name: "Réponse", value: `**${choix.text}**`, inline: false },
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleHug(interaction) {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: "Cette commande ne fonctionne que dans un serveur !", ephemeral: true });
    return;
  }

  const author = interaction.member;
  const targetUser = interaction.options.getUser("cible");
  let targetMember = null;

  if (targetUser) {
    try {
      targetMember = await guild.members.fetch(targetUser.id);
    } catch {
      targetMember = null;
    }
  } else {
    const cached = guild.members.cache.filter((m) => !m.user.bot && m.id !== interaction.user.id);
    if (cached.size === 0) {
      await interaction.reply({
        content: `${author} cherche quelqu'un à câliner... mais personne n'est visible ! Mentionne quelqu'un avec \`/hug @pseudo\` 🫂`,
      });
      return;
    }
    const arr = [...cached.values()];
    targetMember = arr[Math.floor(Math.random() * arr.length)];
  }

  if (!targetMember) {
    await interaction.reply({ content: "Impossible de trouver cette personne.", ephemeral: true });
    return;
  }

  const descriptions = [
    `${author} court vers ${targetMember} et le/la serre très fort dans ses bras, sans dire un mot... parfois les câlins valent mille mots 🫂💛`,
    `${author} enveloppe doucement ${targetMember} dans une longue étreinte chaleureuse. On dirait que quelqu'un avait besoin d'un peu de réconfort 🤗✨`,
    `Un câlin surprise de ${author} pour ${targetMember} ! Personne ne peut résister à autant de chaleur et de bienveillance 💖🫂`,
    `${author} s'approche de ${targetMember} par derrière et lui fait un gros câlin inattendu. La journée est forcément meilleure maintenant ! ☀️🫂`,
    `${author} prend ${targetMember} dans ses bras et refuse de lâcher... ce câlin pourrait durer éternellement 💕🌸`,
    `Avec un grand sourire, ${author} ouvre les bras et ${targetMember} n'a pas d'autre choix que d'accepter ce câlin géant 🫂😊`,
    `${author} dépose sa tête sur l'épaule de ${targetMember} et sourit doucement. Rien de tel qu'un câlin pour tout arranger 💛🌟`,
  ];

  const description = descriptions[Math.floor(Math.random() * descriptions.length)];

  await interaction.deferReply();
  const gifUrl = await fetchAnimeGif("hug");

  const embed = new EmbedBuilder()
    .setColor(0xffb6c1)
    .setTitle("🫂 Câlin !")
    .setDescription(description)
    .setFooter({ text: "Spread love 💖" });

  if (gifUrl) embed.setImage(gifUrl);

  await interaction.editReply({ embeds: [embed] });
}

async function handleKiss(interaction) {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: "Cette commande ne fonctionne que dans un serveur !", ephemeral: true });
    return;
  }

  const author = interaction.member;
  const targetUser = interaction.options.getUser("cible");
  let targetMember = null;

  if (targetUser) {
    try {
      targetMember = await guild.members.fetch(targetUser.id);
    } catch {
      targetMember = null;
    }
  } else {
    const cached = guild.members.cache.filter((m) => !m.user.bot && m.id !== interaction.user.id);
    if (cached.size === 0) {
      await interaction.reply({
        content: `${author} cherche quelqu'un à embrasser... mais personne n'est visible ! Mentionne quelqu'un avec \`/kiss @pseudo\` 💋`,
      });
      return;
    }
    const arr = [...cached.values()];
    targetMember = arr[Math.floor(Math.random() * arr.length)];
  }

  if (!targetMember) {
    await interaction.reply({ content: "Impossible de trouver cette personne.", ephemeral: true });
    return;
  }

  const descriptions = [
    `${author} s'approche doucement de ${targetMember} et dépose un bisou délicat sur sa joue. Le temps semble s'être arrêté pendant un instant... 💋🌸`,
    `Les yeux dans les yeux, ${author} prend la main de ${targetMember} et lui vole un bisou inattendu. Le cœur bat un peu plus vite maintenant 😘💕`,
    `${author} se lève sur la pointe des pieds pour embrasser tendrement ${targetMember}. Certains moments sont tout simplement magiques ✨💋`,
    `Un bisou surprise de ${author} pour ${targetMember} ! Personne ne l'avait vu venir... et ${targetMember} ne s'en plaint pas 😚💫`,
    `${author} chuchote quelque chose à l'oreille de ${targetMember}, puis dépose un baiser doux comme une plume sur ses lèvres 💋🌹`,
    `Dans un élan de tendresse, ${author} embrasse ${targetMember} avec tout l'amour qu'il/elle a à offrir. La scène est digne d'un anime 😳💕✨`,
    `${author} regarde ${targetMember} avec un sourire complice... puis l'embrasse avant que quiconque ne puisse réagir. Quelle audace ! 💋😏🌸`,
  ];

  const description = descriptions[Math.floor(Math.random() * descriptions.length)];

  await interaction.deferReply();
  const gifUrl = await fetchAnimeGif("kiss");

  const embed = new EmbedBuilder()
    .setColor(0xff69b4)
    .setTitle("💋 Bisou !")
    .setDescription(description)
    .setFooter({ text: "With love 💕" });

  if (gifUrl) embed.setImage(gifUrl);

  await interaction.editReply({ embeds: [embed] });
}

async function handleProfil(interaction) {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: "Cette commande ne fonctionne que dans un serveur !", ephemeral: true });
    return;
  }

  const targetUser = interaction.options.getUser("membre") ?? interaction.user;
  let member = null;

  try {
    member = await guild.members.fetch(targetUser.id);
  } catch {
    await interaction.reply({ content: "Impossible de trouver ce membre.", ephemeral: true });
    return;
  }

  const joinedAt = member.joinedAt;
  const createdAt = targetUser.createdAt;

  const roles = member.roles.cache
    .filter((r) => r.id !== guild.id)
    .sort((a, b) => b.position - a.position)
    .map((r) => `<@&${r.id}>`)
    .slice(0, 8)
    .join(" ") || "Aucun rôle";

  const progress = getUserProgress(targetUser.id);
  const rank = getUserRank(targetUser.id);
  const warns = getWarnings(targetUser.id, guild.id);

  const statusMap = {
    online: "🟢 En ligne",
    idle: "🌙 Absent",
    dnd: "🔴 Ne pas déranger",
    offline: "⚫ Hors ligne",
  };
  const status = member.presence?.status ?? "offline";

  const embed = new EmbedBuilder()
    .setColor(0xffd700)
    .setAuthor({
      name: `✨ Profil de ${member.displayName}`,
      iconURL: targetUser.displayAvatarURL({ size: 64 }),
    })
    .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
    .setDescription(`${statusMap[status] ?? "⚫ Hors ligne"}  •  <@${targetUser.id}>`)
    .addFields(
      { name: "\u200b", value: "━━━━━━━━━━ 👤 Informations ━━━━━━━━━━", inline: false },
      { name: "🏷️ Pseudo", value: member.displayName, inline: true },
      { name: "🆔 ID", value: `\`${targetUser.id}\``, inline: true },
      { name: "\u200b", value: "\u200b", inline: true },
      {
        name: "📅 Compte créé le",
        value: `<t:${Math.floor(createdAt.getTime() / 1000)}:D>\n<t:${Math.floor(createdAt.getTime() / 1000)}:R>`,
        inline: true,
      },
      {
        name: "📥 Arrivée sur le serveur",
        value: joinedAt
          ? `<t:${Math.floor(joinedAt.getTime() / 1000)}:D>\n<t:${Math.floor(joinedAt.getTime() / 1000)}:R>`
          : "Inconnu",
        inline: true,
      },
      { name: "\u200b", value: "\u200b", inline: true },
      { name: "\u200b", value: "━━━━━━━━━━ ⭐ Progression ━━━━━━━━━━", inline: false },
      { name: "🏆 Niveau", value: `**${progress.level}**`, inline: true },
      { name: "💎 XP Total", value: `**${progress.totalXp}** XP`, inline: true },
      { name: "📊 Rang", value: `**#${rank}**`, inline: true },
      {
        name: "📈 Progression",
        value: `\`${progress.progressBar}\` **${progress.percent}%**\n${progress.xpInLevel} / ${progress.xpNeeded} XP`,
        inline: false,
      },
      { name: "\u200b", value: "━━━━━━━━━━ 🎭 Serveur ━━━━━━━━━━", inline: false },
      {
        name: "⚠️ Avertissements",
        value: warns.length === 0 ? "✅ Aucun" : `**${warns.length}** avertissement(s)`,
        inline: true,
      },
      { name: `🎭 Rôles (${member.roles.cache.size - 1})`, value: roles, inline: false },
    )
    .setFooter({ text: `Demandé par ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL({ size: 32 }) })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handlePat(interaction) {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: "Cette commande ne fonctionne que dans un serveur !", ephemeral: true });
    return;
  }

  const author = interaction.member;
  const targetUser = interaction.options.getUser("cible");
  let targetMember = null;

  if (targetUser) {
    try {
      targetMember = await guild.members.fetch(targetUser.id);
    } catch {
      targetMember = null;
    }
  } else {
    const cached = guild.members.cache.filter((m) => !m.user.bot && m.id !== interaction.user.id);
    if (cached.size === 0) {
      await interaction.reply({
        content: `${author} cherche quelqu'un à caresser... mais personne n'est visible ! Mentionne quelqu'un avec \`/pat @pseudo\` 🥺`,
      });
      return;
    }
    const arr = [...cached.values()];
    targetMember = arr[Math.floor(Math.random() * arr.length)];
  }

  if (!targetMember) {
    await interaction.reply({ content: "Impossible de trouver cette personne.", ephemeral: true });
    return;
  }

  const descriptions = [
    `${author} pose doucement sa main sur la tête de ${targetMember} et lui fait un petit pat affectueux. C'est trop mignon ! 🥺✨`,
    `${author} s'approche discrètement de ${targetMember} et lui tapote la tête avec un sourire complice. Pat pat~ 🤍`,
    `Les yeux brillants, ${author} tend la main et caresse tendrement les cheveux de ${targetMember}. Personne ne peut résister à autant de douceur 🌸`,
    `${author} chuchote "pat pat~" en posant la main sur la tête de ${targetMember}. Le moment est trop adorable pour les mots 💛`,
    `Un pat surprise de ${author} pour ${targetMember} ! Qui a dit que les guerriers Black Clover ne pouvaient pas être doux ? 🍀🥺`,
    `${author} sourit doucement et caresse la tête de ${targetMember} avec une infinie tendresse. Même Yami approuverait ce moment. 🖤`,
    `${author} répète "pat pat pat" en caressant affectueusement la tête de ${targetMember}. Irrésistible ! 💕`,
  ];

  const description = descriptions[Math.floor(Math.random() * descriptions.length)];

  await interaction.deferReply();
  const gifUrl = await fetchAnimeGif("pat");

  const embed = new EmbedBuilder()
    .setColor(0xffd700)
    .setTitle("🤍 Pat pat !")
    .setDescription(description)
    .setFooter({ text: "Douceur et bienveillance 🌸" });

  if (gifUrl) embed.setImage(gifUrl);

  await interaction.editReply({ embeds: [embed] });
}

async function handleNiveau(interaction) {
  const targetUser = interaction.options.getUser("membre") ?? interaction.user;
  const progress = getUserProgress(targetUser.id);

  const embed = new EmbedBuilder()
    .setColor(0x000000)
    .setTitle(`🍀 Niveau de ${targetUser.username}`)
    .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: "🏆 Niveau actuel", value: `**${progress.level}**`, inline: true },
      { name: "📊 Progression", value: `${progress.xpInLevel} / ${progress.xpNeeded} XP`, inline: true },
      { name: `\u200b`, value: `\`${progress.progressBar}\` ${progress.percent}%`, inline: false },
    )
    .setFooter({ text: "Continue à écrire pour gagner de l'XP !" })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleClassement(interaction) {
  const top = getLeaderboard(10);
  const medals = ["🥇", "🥈", "🥉"];

  if (top.length === 0) {
    await interaction.reply({
      content: "Aucune donnée de niveau pour l'instant. Envoyez des messages pour gagner de l'XP !",
      ephemeral: true,
    });
    return;
  }

  const lines = top.map((entry, i) => {
    const medal = medals[i] ?? `**${i + 1}.**`;
    return `${medal} <@${entry.userId}> — Niveau **${entry.level}** (${entry.xp} XP)`;
  });

  const userRank = getUserRank(interaction.user.id);
  const userInTop = userRank <= top.length;

  const embed = new EmbedBuilder()
    .setColor(0x000000)
    .setTitle("🏆 Classement XP")
    .setDescription(lines.join("\n"))
    .setTimestamp();

  if (!userInTop) {
    const progress = getUserProgress(interaction.user.id);
    embed.addFields({
      name: "━━━━━━━━━━━━━━━━━━━━━━━━",
      value: `**Ta position :** #${userRank} — Niveau **${progress.level}** (${progress.totalXp} XP)`,
      inline: false,
    });
  }

  await interaction.reply({ embeds: [embed] });
}

async function postLore() {
  try {
    const channel = await client.channels.fetch(LORE_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) {
      logger.warn({ channelId: LORE_CHANNEL_ID }, "Salon lore introuvable");
      return;
    }

    const messages = await channel.messages.fetch({ limit: 20 });
    const existing = messages.find((m) => m.author.id === client.user.id && m.embeds.length > 0);

    const loreEmbed = new EmbedBuilder()
      .setColor(0xd4a017)
      .setTitle("🏰✨ BLACK CLOVER RP — GOLDEN ERA ✨🏰")
      .setDescription(
        [
          "*Bienvenue dans la Golden Era, l'âge d'or du Royaume de Clover.*",
          "",
          "Une époque où la magie n'a jamais été aussi puissante. Partout à travers le royaume, de nouveaux talents émergent, des grimoires exceptionnels apparaissent et les jeunes mages rêvent de rejoindre les rangs des prestigieux Ordres de Chevaliers-Mages.",
          "",
          "Le Royaume connaît actuellement une période de prospérité sans précédent. Les villes se développent, les frontières sont stables et les différents Ordres rivalisent pour former les futurs prodiges de demain. Beaucoup considèrent cette période comme le plus grand âge que la magie ait connu.",
          "",
          "━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
          "",
          "Mais derrière cette apparente tranquillité, certaines rumeurs commencent à circuler…",
          "",
          "D'anciennes forces oubliées semblent s'agiter dans l'ombre. Des phénomènes magiques inexpliqués sont signalés aux quatre coins du continent. Des organisations secrètes gagneraient en influence tandis que certains individus poursuivraient des ambitions capables de bouleverser l'équilibre du monde.",
          "",
          "Pour l'instant, personne ne connaît réellement l'ampleur de ces menaces. Le peuple continue de vivre normalement et la majorité des mages se concentre sur sa progression, ses missions et sa renommée.",
          "",
          "━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
          "",
          "Car aujourd'hui, **l'avenir appartient à ceux qui auront la force de le façonner.**",
          "",
          "Dans cette nouvelle ère, les plus grands mages de l'histoire sont encore à écrire. Certains deviendront des héros admirés dans tout le royaume. D'autres emprunteront un chemin plus sombre. Mais une chose est certaine : les événements qui façonneront le futur ont déjà commencé.",
          "",
          "*Le monde retient son souffle.*",
          "*Et votre histoire commence maintenant.*",
          "",
          "━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
          "",
          "✨ **Serez-vous un simple mage parmi tant d'autres, ou l'une des légendes qui marqueront à jamais cette Golden Era ?** ✨",
        ].join("\n"),
      )
      .setImage("https://i.pinimg.com/originals/e6/be/77/e6be774a7578e6967bfd44304b5bcd6d.gif")
      .setFooter({ text: "Black Clover RP — Golden Era 🍀" })
      .setTimestamp();

    if (existing) {
      await existing.edit({ embeds: [loreEmbed] });
      logger.info({ messageId: existing.id }, "Lore mis à jour");
      return;
    }

    const msg = await channel.send({ embeds: [loreEmbed] });
    logger.info({ messageId: msg.id }, "Lore posté avec succès");
  } catch (err) {
    logger.error({ err }, "Erreur lors de la publication du lore");
  }
}

const KINGDOMS = {
  clover: {
    emoji: "☘️",
    name: "Royaume de Clover",
    color: 0x2ecc71,
    desc: "Centre du monde magique. Siège des Chevaliers-Mages et des grandes compagnies. C'est ici que les plus grands mages de l'histoire ont forgé leur légende.",
    style: "Prospère • Magie variée • Chevaliers-Mages",
    lore: "Le Royaume de Clover est gouverné par le Roi et protégé par ses neuf Ordres de Chevaliers-Mages. La compétition entre les compagnies est féroce, et chaque mage rêve d'obtenir un grimoire digne des plus grands.",
    image: "https://static.wikia.nocookie.net/blackclover/images/8/8e/Clover_Kingdom_layout.png/revision/latest?cb=20180604152547",
  },
  heart: {
    emoji: "🌿",
    name: "Royaume de Heart",
    color: 0x27ae60,
    desc: "Royaume en harmonie totale avec la nature et le mana naturel. Les esprits élémentaires y règnent en maîtres.",
    style: "Nature • Mana pur • Esprits élémentaires",
    lore: "Le Royaume de Heart est gouverné par la Princesse Lolopechka. Le peuple vit en symbiose avec les esprits de la nature, et le mana y est d'une pureté incomparable.",
    image: "https://static.wikia.nocookie.net/blackclover/images/5/5f/Heart_Kingdom.png/revision/latest?cb=20191110101738",
  },
  diamond: {
    emoji: "⚔️",
    name: "Royaume de Diamond",
    color: 0x3498db,
    desc: "Nation militaire dominée par la recherche magique avancée et les expérimentations. Une puissance guerrière redoutée.",
    style: "Science magique • Guerre • Expériences",
    lore: "Le Royaume de Diamond est une monarchie militaire où la puissance magique détermine le rang social. Ses mages sont parmi les plus entraînés du continent, forgés par des années de conflits.",
    image: null,
  },
  spade: {
    emoji: "❄️",
    name: "Royaume de Spade",
    color: 0x9b59b6,
    desc: "Terre froide et mystérieuse liée aux Diables et aux forces des ténèbres. Un royaume enveloppé de secrets.",
    style: "Froid • Diables • Mystère",
    lore: "Le Royaume de Spade est gouverné par la Maison Noire, trois mages de grande puissance. Les Diables y exercent une influence considérable, et des rumeurs circulent sur des pactes terrifiants conclus dans l'ombre.",
    image: "https://static.wikia.nocookie.net/blackclover/images/1/11/Spade_Kingdom.png/revision/latest?cb=20200211155443",
  },
};

async function postKingdomMap() {
  try {
    const channel = await client.channels.fetch(MAP_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) {
      logger.warn({ channelId: MAP_CHANNEL_ID }, "Salon carte introuvable");
      return;
    }

    const messages = await channel.messages.fetch({ limit: 20 });
    const existing = messages.find((m) => m.author.id === client.user.id && m.embeds.length > 0);

    const mapEmbed = new EmbedBuilder()
      .setColor(0xd4a017)
      .setTitle("🗺️ Carte des Royaumes — Golden Era")
      .setDescription(
        [
          "Le monde est vaste et chaque royaume possède sa propre identité magique.",
          "Clique sur un bouton pour en apprendre davantage sur chaque territoire.",
          "",
          "☘️ **Clover** • 🌿 **Heart** • ⚔️ **Diamond** • ❄️ **Spade**",
        ].join("\n"),
      )
      .setImage("https://i.pinimg.com/1200x/95/e1/87/95e1875137d7fcb271d80bb11903d425.jpg")
      .setFooter({ text: "Black Clover RP — Golden Era 🍀" });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("map_kingdom_clover").setLabel("Clover").setEmoji("☘️").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("map_kingdom_heart").setLabel("Heart").setEmoji("🌿").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("map_kingdom_diamond").setLabel("Diamond").setEmoji("⚔️").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("map_kingdom_spade").setLabel("Spade").setEmoji("❄️").setStyle(ButtonStyle.Secondary),
    );

    if (existing) {
      await existing.edit({ embeds: [mapEmbed], components: [row] });
      logger.info({ messageId: existing.id }, "Carte des royaumes mise à jour");
      return;
    }

    const msg = await channel.send({ embeds: [mapEmbed], components: [row] });
    logger.info({ messageId: msg.id }, "Carte des royaumes postée avec succès");
  } catch (err) {
    logger.error({ err }, "Erreur lors de la publication de la carte");
  }
}

async function postCloverLore() {
  try {
    const channel = await client.channels.fetch(CLOVER_LORE_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) {
      logger.warn({ channelId: CLOVER_LORE_CHANNEL_ID }, "Salon lore Clover introuvable");
      return;
    }

    const messages = await channel.messages.fetch({ limit: 20 });
    const existing = messages.find((m) => m.author.id === client.user.id && m.embeds.length > 0);

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle("☘️ Royaume de Clover")
      .setDescription(
        [
          "Le Royaume de Clover est l'une des plus grandes puissances du continent.",
          "",
          "Il est gouverné par une famille royale, mais sa véritable force repose sur ses **Chevaliers-Mages** qui assurent la défense du royaume contre les menaces extérieures.",
          "",
          "━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
          "",
          "**La société est divisée en plusieurs classes :**",
          "",
          "👑 Royauté",
          "🏛️ Noblesse",
          "🏘️ Citoyens",
          "🌾 Paysans",
          "",
          "━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
          "",
          "Les familles nobles possèdent généralement davantage de mana et bénéficient d'une meilleure éducation magique. Malgré cela, de nombreux roturiers sont devenus des mages exceptionnels grâce à leur travail et leur détermination.",
          "",
          "*Clover est réputé pour la diversité de ses magies et le nombre impressionnant de talents qui émergent chaque génération.*",
        ].join("\n"),
      )
      .setImage("https://static.wikia.nocookie.net/blackclover/images/8/8e/Clover_Kingdom_layout.png/revision/latest?cb=20180604152547")
      .setFooter({ text: "Black Clover RP — Golden Era 🍀" });

    if (existing) {
      await existing.edit({ embeds: [embed] });
      logger.info({ messageId: existing.id }, "Lore Clover mis à jour");
      return;
    }

    const msg = await channel.send({ embeds: [embed] });
    logger.info({ messageId: msg.id }, "Lore Clover posté avec succès");
  } catch (err) {
    logger.error({ err }, "Erreur lors de la publication du lore Clover");
  }
}

async function handleMapButton(interaction) {
  const key = interaction.customId.replace("map_kingdom_", "");
  const kingdom = KINGDOMS[key];
  if (!kingdom) return;

  const embed = new EmbedBuilder()
    .setColor(kingdom.color)
    .setAuthor({ name: `${kingdom.emoji} ${kingdom.name}` })
    .setDescription(
      [
        `*${kingdom.desc}*`,
        "",
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
        "",
        `📖 ${kingdom.lore}`,
        "",
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      ].join("\n"),
    )
    .addFields({ name: "⚡ Ambiance", value: kingdom.style, inline: false })
    .setFooter({ text: "Black Clover RP — Golden Era 🍀" });

  if (kingdom.image) embed.setImage(kingdom.image);

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function postReglement() {
  try {
    const channel = await client.channels.fetch(REGLEMENT_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) {
      logger.warn({ channelId: REGLEMENT_CHANNEL_ID }, "Salon règlement introuvable");
      return;
    }

    const messages = await channel.messages.fetch({ limit: 20 });
    const existing = messages.find((m) => m.author.id === client.user.id && m.embeds.length > 0);

    const hrpEmbed = new EmbedBuilder()
      .setColor(0x3b82f6)
      .setTitle("📜 Règlement du Serveur")
      .setDescription(
        "Bienvenue sur le serveur. Merci de respecter les règles afin de garantir une bonne ambiance pour tous.",
      )
      .addFields(
        {
          name: "🌐 Règlement HRP",
          value: [
            "**1. Respect**",
            "Respectez tous les membres du serveur.",
            "Les insultes, provocations, harcèlement et discriminations sont interdits.",
            "Les conflits personnels doivent rester en privé.",
            "",
            "**2. Comportement**",
            "Pas de spam, flood ou abus de mentions.",
            "Respectez l'utilisation de chaque salon.",
            "La publicité est interdite sans autorisation du staff.",
            "",
            "**3. Staff**",
            "Respectez les décisions du staff.",
            "En cas de problème, ouvrez un ticket ou contactez un membre du staff calmement.",
          ].join("\n"),
        },
        {
          name: "🎭 Règlement RP",
          value: [
            "**1. Fair-Play** — Jouez de manière réaliste et cohérente. Acceptez les conséquences de vos actions.",
            "**2. Metagaming** — Il est interdit d'utiliser des informations obtenues hors RP dans le RP.",
            "**3. Powergaming** — Ne forcez pas les actions des autres joueurs. Laissez toujours une possibilité de réaction.",
            "**4. FearRP** — Votre personnage doit craindre pour sa vie dans les situations dangereuses.",
            "**5. No Pain RP** — Votre personnage ressent la douleur et doit agir en conséquence.",
            "**6. Combat Log** — Quitter le serveur pour éviter une scène RP est interdit.",
            "**7. Free Kill** — Tuer ou agresser un joueur sans raison RP valable est interdit.",
          ].join("\n"),
        },
        {
          name: "⚖️ Sanctions",
          value:
            "Le non-respect du règlement peut entraîner :\n· Un avertissement.\n· Une exclusion temporaire.\n· Un bannissement selon la gravité des faits.",
        },
        {
          name: "📌 Important",
          value: "Le bon sens est obligatoire. Le but est de créer une expérience RP agréable pour tout le monde.",
        },
        {
          name: "✅ Validation",
          value: "En cliquant sur la réaction ✅, vous reconnaissez avoir pris connaissance du règlement et vous vous engagez à le respecter.",
        },
      )
      .setImage("https://i.pinimg.com/originals/20/16/8d/20168db7d4480f3ba786a12da71f6c29.gif")
      .setFooter({ text: "Black Clover RP — Le staff vous souhaite un bon jeu 🍀" })
      .setTimestamp();

    if (existing) {
      await existing.edit({ embeds: [hrpEmbed] });
      if (!existing.reactions.cache.has("✅")) {
        await existing.react("✅");
      }
      reglementMessageId = existing.id;
      logger.info({ messageId: existing.id }, "Règlement mis à jour");
      return;
    }

    const msg = await channel.send({ embeds: [hrpEmbed] });
    await msg.react("✅");
    reglementMessageId = msg.id;
    logger.info({ messageId: msg.id }, "Règlement posté avec succès");
  } catch (err) {
    logger.error({ err }, "Erreur lors de la publication du règlement");
  }
}

client.on("messageReactionRemove", async (reaction, user) => {
  if (user.bot) return;
  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch {
      return;
    }
  }
  await onGiveawayReaction(reaction, user);
});

client.on("messageReactionAdd", async (reaction, user) => {
  if (user.bot) return;
  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch {
      return;
    }
  }
  await onGiveawayReaction(reaction, user);

  if (reaction.emoji.name !== "✅") return;
  if (reglementMessageId && reaction.message.id !== reglementMessageId) return;

  try {
    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();

    const guild = reaction.message.guild;
    if (!guild) return;

    const member = await guild.members.fetch(user.id);
    await member.roles.add(REGLEMENT_ROLE_ID);
    await member.roles.remove("1510238919445450772");
    logger.info({ userId: user.id }, "Rôle règlement attribué, rôle d'arrivée retiré");
  } catch (err) {
    logger.error({ err, userId: user.id }, "Erreur lors de l'attribution du rôle règlement");
  }
});

async function handleCloseTicket(interaction) {
  const confirmBtn = new ButtonBuilder()
    .setCustomId("ticket_close_confirm")
    .setLabel("✅ Confirmer la fermeture")
    .setStyle(ButtonStyle.Danger);

  const cancelBtn = new ButtonBuilder()
    .setCustomId("ticket_close_cancel")
    .setLabel("❌ Annuler")
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder().addComponents(confirmBtn, cancelBtn);

  await interaction.reply({
    content: "⚠️ Es-tu sûr(e) de vouloir fermer ce ticket ? Le salon sera **supprimé définitivement**.",
    components: [row],
    ephemeral: false,
  });
}

async function postTicketEmbed() {
  try {
    const channel = await client.channels.fetch(TICKET_CHANNEL_ID);
    if (!channel?.isTextBased()) {
      logger.warn({ channelId: TICKET_CHANNEL_ID }, "Salon ticket introuvable");
      return;
    }

    const messages = await channel.messages.fetch({ limit: 10 });
    const existing = messages.find((m) => m.author.id === client.user.id && m.components.length > 0);

    if (existing) {
      logger.info("Embed ticket déjà posté");
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x000000)
      .setTitle("🎟️ Ouvrir un ticket")
      .setDescription("Quelle est la raison de ton ticket ?\nSélectionne une option dans le menu ci-dessous.")
      .setFooter({ text: "Un salon privé sera créé pour toi." });

    const menu = new StringSelectMenuBuilder()
      .setCustomId("ticket_select")
      .setPlaceholder("Choisir une raison...")
      .addOptions(
        {
          label: "Fiche",
          value: "fiche",
          description: "Soumettre ou modifier ta fiche de personnage",
          emoji: "📋",
        },
        { label: "Partenariat", value: "partenariat", description: "Proposer un partenariat avec un autre serveur", emoji: "🤝" },
        { label: "Autre", value: "autre", description: "Toute autre demande ou question", emoji: "💬" },
      );

    const row = new ActionRowBuilder().addComponents(menu);
    await channel.send({ embeds: [embed], components: [row] });
    logger.info("Embed ticket posté avec succès");
  } catch (err) {
    logger.error({ err }, "Erreur lors de la publication de l'embed ticket");
  }
}

async function handleTicketSelect(interaction) {
  const guild = interaction.guild;
  if (!guild) return;

  const choice = interaction.values[0];
  const labels = { fiche: "Fiche", partenariat: "Partenariat", autre: "Autre" };
  const label = labels[choice];
  const pseudo = interaction.user.username;
  const channelName = `${label.toLowerCase()}-${pseudo}`.toLowerCase().replace(/\s+/g, "-");

  await interaction.deferReply({ ephemeral: true });

  try {
    const existing = guild.channels.cache.find((ch) => ch.name === channelName);
    if (existing) {
      await interaction.editReply({ content: `Tu as déjà un ticket ouvert : <#${existing.id}>` });
      return;
    }

    const ticketChannel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: TICKET_CATEGORY_ID,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        {
          id: interaction.user.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
        },
      ],
    });

    const roleMention =
      choice === "partenariat"
        ? `<@&1510238694345281567>`
        : choice === "fiche"
          ? `<@&1510238696379519057>`
          : null;

    const ticketEmbed = new EmbedBuilder()
      .setColor(0x000000)
      .setTitle(`🎟️ Ticket — ${label}`)
      .setDescription(
        `Bienvenue ${interaction.user} !\n\nUn membre du staff va te répondre rapidement. Explique ta demande en détail ci-dessous.`,
      )
      .setFooter({ text: "Pour fermer ce ticket, contacte un administrateur." })
      .setTimestamp();

    const closeBtn = new ButtonBuilder()
      .setCustomId("ticket_close")
      .setLabel("🔒 Fermer le ticket")
      .setStyle(ButtonStyle.Danger);

    const btnRow = new ActionRowBuilder().addComponents(closeBtn);
    const content = roleMention ? `${interaction.user} ${roleMention}` : `${interaction.user}`;

    await ticketChannel.send({ content, embeds: [ticketEmbed], components: [btnRow] });

    await sendLog(
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("🎟️ Ticket ouvert")
        .addFields(
          { name: "Membre", value: `${interaction.user} (${interaction.user.tag})`, inline: true },
          { name: "Raison", value: label, inline: true },
          { name: "Salon", value: `<#${ticketChannel.id}>`, inline: true },
        )
        .setTimestamp(),
    );

    await interaction.editReply({ content: `✅ Ton ticket a été créé : <#${ticketChannel.id}>` });
    logger.info({ userId: interaction.user.id, channelName, choice }, "Ticket créé");
  } catch (err) {
    logger.error({ err, userId: interaction.user.id }, "Erreur lors de la création du ticket");
    await interaction.editReply({ content: "❌ Une erreur est survenue lors de la création du ticket." });
  }
}

client.on("guildMemberRemove", async (member) => {
  await sendLog(
    new EmbedBuilder()
      .setColor(0xfee75c)
      .setTitle("📤 Membre parti")
      .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: "Membre", value: `${member.user.tag}`, inline: true },
        { name: "ID", value: member.id, inline: true },
        {
          name: "A rejoint le",
          value: member.joinedAt ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:D>` : "Inconnu",
          inline: false,
        },
      )
      .setFooter({ text: `${member.guild.memberCount} membres restants` })
      .setTimestamp(),
  );
});

client.on("messageDelete", async (message) => {
  if (message.author?.bot) return;
  if (!message.guild) return;

  await sendLog(
    new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle("🗑️ Message supprimé")
      .addFields(
        {
          name: "Auteur",
          value: message.author ? `${message.author} (${message.author.tag})` : "Inconnu",
          inline: true,
        },
        { name: "Salon", value: message.channel ? `<#${message.channel.id}>` : "Inconnu", inline: true },
        {
          name: "Contenu",
          value: message.content
            ? message.content.length > 1024
              ? message.content.slice(0, 1021) + "..."
              : message.content
            : "*Contenu indisponible*",
          inline: false,
        },
      )
      .setTimestamp(),
  );
});

client.on("messageUpdate", async (oldMessage, newMessage) => {
  if (newMessage.author?.bot) return;
  if (!newMessage.guild) return;
  if (oldMessage.content === newMessage.content) return;

  await sendLog(
    new EmbedBuilder()
      .setColor(0xffa500)
      .setTitle("✏️ Message modifié")
      .setURL(newMessage.url)
      .addFields(
        {
          name: "Auteur",
          value: newMessage.author ? `${newMessage.author} (${newMessage.author.tag})` : "Inconnu",
          inline: true,
        },
        { name: "Salon", value: `<#${newMessage.channel.id}>`, inline: true },
        {
          name: "Avant",
          value: oldMessage.content
            ? oldMessage.content.length > 512
              ? oldMessage.content.slice(0, 509) + "..."
              : oldMessage.content
            : "*Indisponible*",
          inline: false,
        },
        {
          name: "Après",
          value: newMessage.content
            ? newMessage.content.length > 512
              ? newMessage.content.slice(0, 509) + "..."
              : newMessage.content
            : "*Indisponible*",
          inline: false,
        },
      )
      .setTimestamp(),
  );
});

client.on("guildBanAdd", async (ban) => {
  await sendLog(
    new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle("🔨 Membre banni")
      .setThumbnail(ban.user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: "Membre", value: `${ban.user.tag}`, inline: true },
        { name: "ID", value: ban.user.id, inline: true },
        { name: "Raison", value: ban.reason ?? "Aucune raison fournie", inline: false },
      )
      .setTimestamp(),
  );
});

client.on("guildBanRemove", async (ban) => {
  await sendLog(
    new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("✅ Membre débanni")
      .setThumbnail(ban.user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: "Membre", value: `${ban.user.tag}`, inline: true },
        { name: "ID", value: ban.user.id, inline: true },
      )
      .setTimestamp(),
  );
});

client.on("guildMemberUpdate", async (oldMember, newMember) => {
  const addedRoles = newMember.roles.cache.filter((r) => !oldMember.roles.cache.has(r.id));
  const removedRoles = oldMember.roles.cache.filter((r) => !newMember.roles.cache.has(r.id));

  if (addedRoles.size === 0 && removedRoles.size === 0) return;

  const fields = [];
  if (addedRoles.size > 0)
    fields.push({ name: "Rôles ajoutés", value: addedRoles.map((r) => `<@&${r.id}>`).join(" "), inline: false });
  if (removedRoles.size > 0)
    fields.push({ name: "Rôles retirés", value: removedRoles.map((r) => `<@&${r.id}>`).join(" "), inline: false });

  await sendLog(
    new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle("🎭 Rôles modifiés")
      .addFields({ name: "Membre", value: `${newMember} (${newMember.user.tag})`, inline: true }, ...fields)
      .setTimestamp(),
  );
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;

  const result = tryGiveXp(message.author.id);
  if (!result?.leveledUp) return;

  try {
    const ch = await client.channels.fetch(LEVEL_UP_CHANNEL_ID);
    if (!ch?.isTextBased()) return;

    const embed = new EmbedBuilder()
      .setColor(0x000000)
      .setTitle("✨ Niveau supérieur !")
      .setDescription(`Bravo ${message.author} ! Tu es passé(e) au **niveau ${result.newLevel}** ! Continue comme ça ! 🍀`)
      .setImage(randomLevelUpGif())
      .setTimestamp();

    await ch.send({ embeds: [embed] });
  } catch (err) {
    logger.error({ err }, "Erreur lors de l'envoi du message de level-up");
  }
});

function parseDuration(str) {
  const regex = /^(?:(\d+)h)?(?:(\d+)m)?$/;
  const match = str.trim().match(regex);
  if (!match || (!match[1] && !match[2])) return null;
  const hours = parseInt(match[1] ?? 0);
  const minutes = parseInt(match[2] ?? 0);
  const ms = (hours * 60 + minutes) * 60 * 1000;
  const MIN = 5 * 60 * 1000;
  const MAX = 48 * 60 * 60 * 1000;
  if (ms < MIN || ms > MAX) return null;
  return ms;
}

async function handleMute(interaction) {
  if (!hasRole(interaction.member, MOD_ROLES)) {
    await interaction.reply({ content: "❌ Tu n'as pas la permission d'utiliser cette commande.", ephemeral: true });
    return;
  }

  const targetUser = interaction.options.getUser("membre", true);
  const duréeStr = interaction.options.getString("durée", true);
  const raison = interaction.options.getString("raison") ?? "Aucune raison fournie";
  const guild = interaction.guild;
  if (!guild) return;

  const ms = parseDuration(duréeStr);
  if (!ms) {
    await interaction.reply({
      content: "❌ Durée invalide. Utilise un format comme `5m`, `30m`, `1h`, `2h30m`, `48h` (entre 5m et 48h).",
      ephemeral: true,
    });
    return;
  }

  let target;
  try {
    target = await guild.members.fetch(targetUser.id);
  } catch {
    await interaction.reply({ content: "❌ Impossible de trouver ce membre.", ephemeral: true });
    return;
  }

  if (!target.moderatable) {
    await interaction.reply({ content: "❌ Je ne peux pas mute ce membre (rôle trop élevé ou protégé).", ephemeral: true });
    return;
  }

  if (target.id === interaction.user.id) {
    await interaction.reply({ content: "❌ Tu ne peux pas te mute toi-même.", ephemeral: true });
    return;
  }

  try {
    await target.timeout(ms, raison);
    const heures = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const duréeLabel = heures > 0
      ? `${heures}h${minutes > 0 ? `${minutes}m` : ""}`
      : `${minutes}m`;

    const embed = new EmbedBuilder()
      .setColor(0xffa500)
      .setTitle("🔇 Membre muet")
      .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: "Membre", value: `${targetUser} (${targetUser.tag})`, inline: true },
        { name: "Durée", value: duréeLabel, inline: true },
        { name: "Modérateur", value: `${interaction.user} (${interaction.user.tag})`, inline: false },
        { name: "Raison", value: raison, inline: false },
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
    await sendLog(embed);
    logger.info({ targetId: targetUser.id, modId: interaction.user.id, ms, raison }, "Membre mute");
  } catch (err) {
    logger.error({ err }, "Erreur lors du mute");
    await interaction.reply({ content: "❌ Une erreur est survenue lors du mute.", ephemeral: true });
  }
}

async function handleUnmute(interaction) {
  if (!hasRole(interaction.member, MOD_ROLES)) {
    await interaction.reply({ content: "❌ Tu n'as pas la permission d'utiliser cette commande.", ephemeral: true });
    return;
  }

  const targetUser = interaction.options.getUser("membre", true);
  const raison = interaction.options.getString("raison") ?? "Aucune raison fournie";
  const guild = interaction.guild;
  if (!guild) return;

  let target;
  try {
    target = await guild.members.fetch(targetUser.id);
  } catch {
    await interaction.reply({ content: "❌ Impossible de trouver ce membre.", ephemeral: true });
    return;
  }

  if (!target.isCommunicationDisabled()) {
    await interaction.reply({ content: "❌ Ce membre n'est pas actuellement mute.", ephemeral: true });
    return;
  }

  if (!target.moderatable) {
    await interaction.reply({ content: "❌ Je ne peux pas démute ce membre (rôle trop élevé ou protégé).", ephemeral: true });
    return;
  }

  try {
    await target.timeout(null, raison);

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("🔊 Membre démute")
      .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: "Membre", value: `${targetUser} (${targetUser.tag})`, inline: true },
        { name: "Modérateur", value: `${interaction.user} (${interaction.user.tag})`, inline: false },
        { name: "Raison", value: raison, inline: false },
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
    await sendLog(embed);
    logger.info({ targetId: targetUser.id, modId: interaction.user.id, raison }, "Membre démute");
  } catch (err) {
    logger.error({ err }, "Erreur lors du démute");
    await interaction.reply({ content: "❌ Une erreur est survenue lors du démute.", ephemeral: true });
  }
}

async function handleWarn(interaction) {
  if (!hasRole(interaction.member, MOD_ROLES)) {
    await interaction.reply({ content: "❌ Tu n'as pas la permission d'utiliser cette commande.", ephemeral: true });
    return;
  }

  const targetUser = interaction.options.getUser("membre", true);
  const raison = interaction.options.getString("raison", true);
  const guild = interaction.guild;
  if (!guild) return;

  const { total } = addWarning(targetUser.id, guild.id, raison, interaction.user.id);

  const embed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle("⚠️ Avertissement")
    .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: "Membre", value: `${targetUser} (${targetUser.tag})`, inline: true },
      { name: "Avertissement n°", value: `${total}`, inline: true },
      { name: "Modérateur", value: `${interaction.user} (${interaction.user.tag})`, inline: false },
      { name: "Raison", value: raison, inline: false },
    )
    .setTimestamp();

  try {
    await targetUser.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle("⚠️ Tu as reçu un avertissement")
          .setDescription(`Tu as été averti(e) sur **${guild.name}**.`)
          .addFields(
            { name: "Raison", value: raison },
            { name: "Avertissement n°", value: `${total}` },
          )
          .setTimestamp(),
      ],
    });
  } catch {
    logger.warn({ userId: targetUser.id }, "Impossible d'envoyer le DM d'avertissement");
  }

  await interaction.reply({ embeds: [embed] });
  await sendLog(embed);
  logger.info({ targetId: targetUser.id, modId: interaction.user.id, raison, total }, "Membre averti");
}

async function handleWarnings(interaction) {
  if (!hasRole(interaction.member, MOD_ROLES)) {
    await interaction.reply({ content: "❌ Tu n'as pas la permission d'utiliser cette commande.", ephemeral: true });
    return;
  }
  const targetUser = interaction.options.getUser("membre", true);
  const guild = interaction.guild;
  if (!guild) return;
  const warns = getWarnings(targetUser.id, guild.id);

  if (warns.length === 0) {
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle(`📋 Avertissements de ${targetUser.username}`)
          .setDescription("✅ Aucun avertissement enregistré.")
          .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
          .setTimestamp(),
      ],
    });
    return;
  }

  const fields = warns.map((w, i) => ({
    name: `Warn #${i + 1} — ${new Date(w.timestamp).toLocaleDateString("fr-FR")}`,
    value: `**Raison :** ${w.reason}\n**Modérateur :** <@${w.moderatorId}>`,
    inline: false,
  }));

  const embed = new EmbedBuilder()
    .setColor(0x8b0000)
    .setTitle(`⚠️ Avertissements de ${targetUser.username}`)
    .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
    .addFields(fields)
    .setFooter({ text: `Total : ${warns.length} avertissement(s)` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleSupprimerWarn(interaction) {
  if (!hasRole(interaction.member, MOD_ROLES)) {
    await interaction.reply({ content: "❌ Tu n'as pas la permission d'utiliser cette commande.", ephemeral: true });
    return;
  }

  const targetUser = interaction.options.getUser("membre", true);
  const numero = interaction.options.getInteger("numero", true);
  const guild = interaction.guild;
  if (!guild) return;

  const warns = getWarnings(targetUser.id, guild.id);

  if (warns.length === 0) {
    await interaction.reply({ content: "✅ Ce membre n'a aucun avertissement.", ephemeral: true });
    return;
  }

  if (numero > warns.length) {
    await interaction.reply({
      content: `❌ Numéro invalide. Ce membre a **${warns.length}** avertissement(s). Utilise \`/warnings\` pour voir la liste.`,
      ephemeral: true,
    });
    return;
  }

  const target = warns[numero - 1];
  const removed = removeWarning(targetUser.id, guild.id, target.id);

  if (!removed) {
    await interaction.reply({ content: "❌ Une erreur est survenue lors de la suppression.", ephemeral: true });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("🗑️ Avertissement supprimé")
    .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: "Membre", value: `${targetUser} (${targetUser.tag})`, inline: true },
      { name: "Warn supprimé", value: `#${numero}`, inline: true },
      { name: "Raison du warn", value: target.reason, inline: false },
      { name: "Supprimé par", value: `${interaction.user} (${interaction.user.tag})`, inline: false },
      { name: "Warns restants", value: `${warns.length - 1}`, inline: true },
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
  await sendLog(embed);
  logger.info({ targetId: targetUser.id, modId: interaction.user.id, warnId: target.id }, "Avertissement supprimé");
}

export function startBot() {
  if (!token) return;
  client.login(token).catch((err) => {
    logger.error({ err }, "Impossible de connecter le bot Discord");
  });
}

startBot();

process.on("unhandledRejection", (err) => {
  logger.error({ err }, "Promesse rejetée non gérée");
});

process.on("uncaughtException", (err) => {
  logger.error({ err }, "Exception non gérée");
});
