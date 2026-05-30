import {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  StringSelectMenuInteraction,
  GuildMember,
  Guild,
  EmbedBuilder,
  TextChannel,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
  ChannelType,
  PermissionFlagsBits,
  AutocompleteInteraction,
} from "discord.js";
import { logger } from "./lib/logger.js";
import { tryGiveXp, getUserProgress, getLeaderboard, getUserRank } from "./xp.js";
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

const TICKET_CHANNEL_ID = "1510239134516514946";
const LEVEL_UP_CHANNEL_ID = "1510274607788331148";
const LEVEL_UP_GIF =
  "https://i.pinimg.com/originals/cd/42/90/cd42901add11a576950afcfa4a2e1658.gif";
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
    .setName("hug")
    .setDescription("Fais un câlin à quelqu'un !")
    .addUserOption((option) =>
      option
        .setName("cible")
        .setDescription("La personne à câliner")
        .setRequired(false),
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("kiss")
    .setDescription("Fais un bisou à quelqu'un !")
    .addUserOption((option) =>
      option
        .setName("cible")
        .setDescription("La personne à embrasser")
        .setRequired(false),
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("Affiche les infos d'un membre du serveur")
    .addUserOption((option) =>
      option
        .setName("membre")
        .setDescription("Le membre à inspecter (toi par défaut)")
        .setRequired(false),
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("pat")
    .setDescription("Caresse la tête de quelqu'un !")
    .addUserOption((option) =>
      option
        .setName("cible")
        .setDescription("La personne à câliner")
        .setRequired(false),
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("niveau")
    .setDescription("Affiche ton niveau et ta progression XP")
    .addUserOption((option) =>
      option
        .setName("membre")
        .setDescription("Le membre à inspecter (toi par défaut)")
        .setRequired(false),
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("classement")
    .setDescription("Affiche le top 10 des membres les plus actifs")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Expulser un membre du serveur")
    .addUserOption((o) =>
      o.setName("membre").setDescription("Le membre à expulser").setRequired(true),
    )
    .addStringOption((o) =>
      o.setName("raison").setDescription("Raison de l'expulsion").setRequired(false),
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Bannir un membre du serveur")
    .addUserOption((o) =>
      o.setName("membre").setDescription("Le membre à bannir").setRequired(true),
    )
    .addStringOption((o) =>
      o.setName("raison").setDescription("Raison du ban").setRequired(false),
    )
    .addIntegerOption((o) =>
      o
        .setName("supprimer_messages")
        .setDescription("Supprimer les messages des derniers X jours (0-7)")
        .setRequired(false)
        .setMinValue(0)
        .setMaxValue(7),
    )
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

async function registerCommandsForGuild(guild, appId) {
  try {
    await rest.put(Routes.applicationGuildCommands(appId, guild.id), {
      body: commands,
    });
    logger.info({ guildId: guild.id, guildName: guild.name }, "Commandes slash enregistrées");
  } catch (err) {
    logger.error({ err, guildId: guild.id }, "Erreur lors de l'enregistrement des commandes");
  }
}

client.once("clientReady", async (c) => {
  logger.info({ tag: c.user.tag }, "Bot Discord connecté");
  rest = new REST({ version: "10" }).setToken(token);
  initGiveaways(c);
  for (const guild of c.guilds.cache.values()) {
    await registerCommandsForGuild(guild, c.user.id);
  }
  await postReglement();
  await postTicketEmbed();
});

client.on("guildCreate", async (guild) => {
  logger.info({ guildId: guild.id, guildName: guild.name }, "Bot rejoint un nouveau serveur");
  if (rest && client.user) {
    await registerCommandsForGuild(guild, client.user.id);
  }
});

client.on("guildMemberAdd", async (member) => {
  const guild = member.guild;
  const welcomeChannelId = process.env["WELCOME_CHANNEL_ID"];
  let welcomeChannel;

  if (welcomeChannelId) {
    try {
      const fetched = await guild.channels.fetch(welcomeChannelId);
      if (fetched?.isTextBased()) welcomeChannel = fetched;
    } catch {
      logger.warn({ guildId: guild.id, welcomeChannelId }, "Impossible de récupérer le salon par ID");
    }
  } else {
    await guild.channels.fetch();
    welcomeChannel = guild.channels.cache.find(
      (ch) =>
        ch.isTextBased() &&
        (ch.name.toLowerCase().includes("bienvenue") ||
          ch.name.includes("🏮") ||
          ch.name.includes("welcome")),
    );
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
    .setColor(0x000000)
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

  if (interaction.commandName === "hug") {
    await handleHug(interaction);
  } else if (interaction.commandName === "kiss") {
    await handleKiss(interaction);
  } else if (interaction.commandName === "userinfo") {
    await handleUserinfo(interaction);
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
  } else if (interaction.commandName === "kick") {
    await handleKick(interaction);
  } else if (interaction.commandName === "ban") {
    await handleBan(interaction);
  }
});

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
    await interaction.reply({ content: "❌ Je ne peux pas expulser ce membre (rôle trop élevé ou protégé).", ephemeral: true });
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
    await interaction.reply({ content: "❌ Je ne peux pas bannir ce membre (rôle trop élevé ou protégé).", ephemeral: true });
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
        { name: "Messages supprimés", value: deleteMessageDays > 0 ? `${deleteMessageDays} jour(s)` : "Aucun", inline: true },
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
    try { targetMember = await guild.members.fetch(targetUser.id); } catch { targetMember = null; }
  } else {
    const cached = guild.members.cache.filter((m) => !m.user.bot && m.id !== interaction.user.id);
    if (cached.size === 0) {
      await interaction.reply({ content: `${author} cherche quelqu'un à câliner... mais personne n'est visible ! Mentionne quelqu'un avec \`/hug @pseudo\` 🫂` });
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
    try { targetMember = await guild.members.fetch(targetUser.id); } catch { targetMember = null; }
  } else {
    const cached = guild.members.cache.filter((m) => !m.user.bot && m.id !== interaction.user.id);
    if (cached.size === 0) {
      await interaction.reply({ content: `${author} cherche quelqu'un à embrasser... mais personne n'est visible ! Mentionne quelqu'un avec \`/kiss @pseudo\` 💋` });
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

async function handleUserinfo(interaction) {
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
    .slice(0, 10)
    .join(" ") || "Aucun rôle";

  const embed = new EmbedBuilder()
    .setColor(member.displayColor || 0x7289da)
    .setTitle(`📋 Infos de ${targetUser.username}`)
    .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: "🏷️ Pseudo", value: member.displayName, inline: true },
      { name: "🆔 ID", value: targetUser.id, inline: true },
      { name: "🤖 Bot ?", value: targetUser.bot ? "Oui" : "Non", inline: true },
      {
        name: "📅 Compte créé le",
        value: `<t:${Math.floor(createdAt.getTime() / 1000)}:D> (<t:${Math.floor(createdAt.getTime() / 1000)}:R>)`,
        inline: false,
      },
      {
        name: "📥 A rejoint le serveur le",
        value: joinedAt
          ? `<t:${Math.floor(joinedAt.getTime() / 1000)}:D> (<t:${Math.floor(joinedAt.getTime() / 1000)}:R>)`
          : "Inconnu",
        inline: false,
      },
      { name: `🎭 Rôles (${member.roles.cache.size - 1})`, value: roles, inline: false },
    )
    .setFooter({ text: `Demandé par ${interaction.user.username}` })
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
    try { targetMember = await guild.members.fetch(targetUser.id); } catch { targetMember = null; }
  } else {
    const cached = guild.members.cache.filter((m) => !m.user.bot && m.id !== interaction.user.id);
    if (cached.size === 0) {
      await interaction.reply({ content: `${author} cherche quelqu'un à caresser... mais personne n'est visible ! Mentionne quelqu'un avec \`/pat @pseudo\` 🥺` });
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

async function postReglement() {
  try {
    const channel = await client.channels.fetch(REGLEMENT_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) {
      logger.warn({ channelId: REGLEMENT_CHANNEL_ID }, "Salon règlement introuvable");
      return;
    }

    const messages = await channel.messages.fetch({ limit: 20 });
    const existing = messages.find((m) => m.author.id === client.user.id && m.embeds.length > 0);

    if (existing) {
      reglementMessageId = existing.id;
      if (!existing.reactions.cache.has("✅")) {
        await existing.react("✅");
      }
      logger.info({ messageId: existing.id }, "Règlement déjà posté, message récupéré");
      return;
    }

    const hrpEmbed = new EmbedBuilder()
      .setColor(0x000000)
      .setTitle("📜 RÈGLEMENT DU SERVEUR")
      .addFields(
        {
          name: "━━━━━━━━ 〔 HRP — HORS ROLEPLAY 〕 ━━━━━━━━",
          value: [
            "**1.** Respectez tous les membres du serveur, qu'ils soient joueurs, modérateurs ou administrateurs. Toute forme de harcèlement, discrimination ou insulte sera sanctionnée immédiatement.",
            "**2.** Le spam, les majuscules abusives et les messages répétitifs sont strictement interdits dans tous les salons.",
            "**3.** La publicité pour d'autres serveurs Discord est interdite sans autorisation préalable d'un administrateur.",
            "**4.** Les conflits entre membres doivent être réglés en privé ou via un ticket. Ne perturbez pas les salons publics avec vos désaccords.",
            "**5.** Tout contenu NSFW, choquant ou illégal est formellement interdit sur ce serveur.",
            "**6.** Respectez les décisions du staff. En cas de désaccord, ouvrez un ticket calmement.",
          ].join("\n\n"),
        },
        {
          name: "━━━━━━━━ 〔 RP — ROLEPLAY 〕 ━━━━━━━━",
          value: [
            "**1.** Restez dans votre personnage en permanence dans les salons RP. Les parenthèses `(( ))` sont réservées aux messages HRP urgents.",
            "**2.** Le **God-modding** (rendre votre personnage invincible) et le **Power-play** (contrôler le personnage d'un autre sans son accord) sont strictement interdits.",
            "**3.** Respectez le lore de Black Clover. Toute capacité ou personnage hors-lore doit être validé par le staff avant utilisation.",
            "**4.** Un minimum de **3 lignes** par réponse RP est exigé. Les réponses trop courtes appauvrissent l'expérience de tous.",
            "**5.** La mort d'un personnage ne peut avoir lieu qu'avec l'accord **explicite** du joueur concerné, sauf règles de combat spécifiques validées.",
            "**6.** Toute fiche de personnage doit être approuvée par le staff avant de commencer à jouer. Joueur sans fiche validée = RP non reconnu.",
          ].join("\n\n"),
        },
        {
          name: "✅ Validation",
          value: "En réagissant avec ✅ ci-dessous, vous confirmez avoir **lu et accepté** l'intégralité de ce règlement.",
        },
      )
      .setFooter({ text: "Black Clover RP — Le staff vous souhaite un bon jeu 🍀" })
      .setTimestamp();

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
    try { await reaction.fetch(); } catch { return; }
  }
  await onGiveawayReaction(reaction, user);
});

client.on("messageReactionAdd", async (reaction, user) => {
  if (user.bot) return;
  if (reaction.partial) {
    try { await reaction.fetch(); } catch { return; }
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
        { label: "Fiche", value: "fiche", description: "Soumettre ou modifier ta fiche de personnage", emoji: "📋" },
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
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ],
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
      .setDescription(`Bienvenue ${interaction.user} !\n\nUn membre du staff va te répondre rapidement. Explique ta demande en détail ci-dessous.`)
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
      .addFields(
        { name: "Membre", value: `${newMember} (${newMember.user.tag})`, inline: true },
        ...fields,
      )
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
      .setDescription(
        `Bravo ${message.author} ! Tu es passé(e) au **niveau ${result.newLevel}** ! Continue comme ça ! 🍀`,
      )
      .setImage(LEVEL_UP_GIF)
      .setTimestamp();

    await ch.send({ embeds: [embed] });
  } catch (err) {
    logger.error({ err }, "Erreur lors de l'envoi du message de level-up");
  }
});

export function startBot() {
  if (!token) return;
  client.login(token).catch((err) => {
    logger.error({ err }, "Impossible de connecter le bot Discord");
  });
}

