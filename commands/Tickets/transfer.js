const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const fs = require("fs");
const yaml = require("yaml");
const configFile = fs.readFileSync("./config.yml", "utf8");
const config = yaml.parse(configFile);
const {
  ticketsDB,
  sanitizeInput,
  logMessage,
  getUser,
  checkSupportRole,
  configEmbed,
} = require("../../index.js");

module.exports = {
  enabled: config.commands.transfer.enabled,
  data: new SlashCommandBuilder()
    .setName("transfer")
    .setDescription("Transfer the ownership of a ticket to another user.")
    .addUserOption((option) =>
      option.setName("user").setDescription("Select a user").setRequired(true),
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits[config.commands.transfer.permission],
    )
    .setDMPermission(false),
  async execute(interaction) {
    if (!(await ticketsDB.has(interaction.channel.id))) {
      return interaction.reply({
        content:
          config.errors.not_in_a_ticket || "You are not in a ticket channel!",
        ephemeral: true,
      });
    }

    const hasSupportRole = await checkSupportRole(interaction);
    if (!hasSupportRole) {
      return interaction.reply({
        content:
          config.errors.not_allowed || "You are not allowed to use this!",
        ephemeral: true,
      });
    }

    let optionUser = interaction.options.getUser("user");
    let ticketType = await ticketsDB.get(
      `${interaction.channel.id}.ticketType`,
    );
    let currentUser = await getUser(
      await ticketsDB.get(`${interaction.channel.id}.userID`),
    );

    if (optionUser === currentUser) {
      return interaction.reply({
        content: "This user is already the creator of this ticket.",
        ephemeral: true,
      });
    }

    if (optionUser.bot) {
      return interaction.reply({
        content: "You cannot transfer a ticket to a bot.",
        ephemeral: true,
      });
    }

    await interaction.deferReply();
    await interaction.channel.permissionOverwrites.delete(currentUser);
    await ticketsDB.set(`${interaction.channel.id}.userID`, optionUser.id);
    await interaction.channel.permissionOverwrites.create(optionUser, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
      AttachFiles: true,
      EmbedLinks: true,
    });
    if (config.commands.transfer.updateTopic) {
      let newTopic =
        config.commands.transfer.newTopic ||
        "Ticket Creator: {user} | Ticket Type: {type}";
      newTopic = newTopic
        .replace(/\{user\}/g, `${sanitizeInput(optionUser.tag)}`)
        .replace(/\{type\}/g, `${ticketType}`);
      await interaction.channel.setTopic(newTopic);
    }
    if (interaction.channel.name.includes(currentUser.username)) {
      await interaction.channel.setName(`${ticketType}-${optionUser.username}`);
    }

    let logChannelId = config.logs.ticketTransfer || config.logs.default;
    let logChannel = interaction.guild.channels.cache.get(logChannelId);

    const logDefaultValues = {
      color: "#2FF200",
      title: "Ticket Logs | Ticket Creator Transferred",
      timestamp: true,
      thumbnail: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
      footer: {
        text: `${interaction.user.tag}`,
        iconURL: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
      },
    };

    const logTransferEmbed = await configEmbed(
      "logTransferEmbed",
      logDefaultValues,
    );

    logTransferEmbed.addFields([
      {
        name: config.logTransferEmbed.field_staff,
        value: `> ${interaction.user}\n> ${sanitizeInput(interaction.user.tag)}`,
      },
      {
        name: config.logTransferEmbed.field_ticket,
        value: `> ${interaction.channel}\n> #${sanitizeInput(interaction.channel.name)}`,
      },
      {
        name: config.logTransferEmbed.field_transfer,
        value: `> ${currentUser} (${sanitizeInput(currentUser.tag)}) -> ${optionUser} (${sanitizeInput(optionUser.tag)})`,
      },
    ]);

    if (config.toggleLogs.ticketTransfer) {
      await logChannel.send({ embeds: [logTransferEmbed] });
    }

    const defaultValues = {
      color: "#2FF200",
      description:
        "The ownership of this ticket has been transferred to **{user} ({user.tag})**.",
    };

    const transferEmbed = await configEmbed("transferEmbed", defaultValues);

    if (transferEmbed.data && transferEmbed.data.description) {
      transferEmbed.setDescription(
        transferEmbed.data.description
          .replace(/\{user\}/g, optionUser)
          .replace(/\{user\.tag\}/g, sanitizeInput(optionUser.tag)),
      );
    }

    let transferReply = {
      embeds: [transferEmbed],
    };

    if (config.commands.transfer.pingUser) {
      transferReply.content = `<@${optionUser.id}>`;
    }

    await interaction.editReply(transferReply);
    logMessage(
      `${interaction.user.tag} transferred the ownership of the ticket #${interaction.channel.name} to the user ${optionUser.tag}.`,
    );
  },
};
