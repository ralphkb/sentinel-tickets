const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} = require("discord.js");
const fs = require("fs");
const yaml = require("yaml");
const configFile = fs.readFileSync("./config.yml", "utf8");
const config = yaml.parse(configFile);
const { ticketsDB, ticketCategories } = require("../../init.js");
const {
  sanitizeInput,
  logMessage,
  configEmbed,
  getUser,
} = require("../../utils/mainUtils.js");

module.exports = {
  enabled: config.commands.closerequest.enabled,
  data: new SlashCommandBuilder()
    .setName("closerequest")
    .setDescription("Request closing a ticket.")
    .setDefaultMemberPermissions(
      PermissionFlagsBits[config.commands.closerequest.permission],
    )
    .setDMPermission(false),
  async execute(interaction) {
    if (!config.closeStaffOnly) {
      return interaction.reply({
        content:
          "This feature is currently disabled because you have the permission to close your own ticket.",
        ephemeral: true,
      });
    }

    if (!(await ticketsDB.has(interaction.channel.id))) {
      return interaction.reply({
        content:
          config.errors.not_in_a_ticket || "You are not in a ticket channel!",
        ephemeral: true,
      });
    }

    if (
      (await ticketsDB.get(`${interaction.channel.id}.status`)) === "Closed"
    ) {
      return interaction.reply({
        content: "This ticket is already closed!",
        ephemeral: true,
      });
    }

    let ticketUserID = await getUser(
      await ticketsDB.get(`${interaction.channel.id}.userID`),
    );
    if (interaction.user !== ticketUserID) {
      return interaction.reply({
        content: "You are not the ticket creator!",
        ephemeral: true,
      });
    }

    await interaction.deferReply();
    let ticketButton = await ticketsDB.get(`${interaction.channel.id}.button`);

    const closeButton = new ButtonBuilder()
      .setCustomId("closeTicket")
      .setLabel(config.closeButton.label)
      .setEmoji(config.closeButton.emoji)
      .setStyle(ButtonStyle[config.closeButton.style]);

    let row = new ActionRowBuilder().addComponents(closeButton);

    const defaultValues = {
      color: "#FF2400",
      title: "Ticket Close Request",
      description:
        "**{user} ({user.tag})** has requested to have his ticket closed.",
      timestamp: true,
      footer: {
        text: `${interaction.user.tag}`,
        iconURL: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
      },
    };

    const closeRequestEmbed = await configEmbed(
      "closeRequestEmbed",
      defaultValues,
    );

    if (closeRequestEmbed.data && closeRequestEmbed.data.description) {
      closeRequestEmbed.setDescription(
        closeRequestEmbed.data.description
          .replace(/\{user\}/g, `${interaction.user}`)
          .replace(/\{user\.tag\}/g, sanitizeInput(interaction.user.tag)),
      );
    }

    let requestReply = {
      embeds: [closeRequestEmbed],
      components: [row],
    };

    if (config.commands.closerequest.pingRoles) {
      const category = ticketCategories[ticketButton];
      const pingRoles = category.ping_role_ids.length > 0;
      const rolesToMention = pingRoles
        ? category.ping_role_ids.map((roleId) => `<@&${roleId}>`).join(" ")
        : "";
      requestReply.content = rolesToMention;
    }

    await interaction.editReply(requestReply);

    logMessage(
      `${interaction.user.tag} requested his ticket #${interaction.channel.name} to be closed by staff.`,
    );
  },
};
