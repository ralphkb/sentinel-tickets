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
const {
  ticketsDB,
  logMessage,
  client,
  checkSupportRole,
  configEmbed,
} = require("../../index.js");

module.exports = {
  enabled: config.commands.alert.enabled,
  data: new SlashCommandBuilder()
    .setName("alert")
    .setDescription("Alert the ticket creator.")
    .setDefaultMemberPermissions(
      PermissionFlagsBits[config.commands.alert.permission],
    )
    .setDMPermission(false),
  async execute(interaction) {
    if (!(await ticketsDB.has(interaction.channel.id))) {
      return interaction.reply({
        content: config.errors.not_in_a_ticket,
        ephemeral: true,
      });
    }

    const hasSupportRole = await checkSupportRole(interaction);
    if (!hasSupportRole) {
      return interaction.reply({
        content: config.errors.not_allowed,
        ephemeral: true,
      });
    }

    await interaction.deferReply();
    const user = client.users.cache.get(
      await ticketsDB.get(`${interaction.channel.id}.userID`),
    );

    const closeButton = new ButtonBuilder()
      .setCustomId("closeTicket")
      .setLabel(config.closeButton.label)
      .setEmoji(config.closeButton.emoji)
      .setStyle(ButtonStyle[config.closeButton.style]);

    const ticketAlertRow = new ActionRowBuilder().addComponents(closeButton);

    const defaultValues = {
      color: "#2FF200",
      title: "Ticket Close Notification",
      description:
        "This ticket will be closed soon if no response has been received.",
      timestamp: true,
    };

    const alertEmbed = await configEmbed("alertEmbed", defaultValues);

    interaction.editReply({
      content: `<@${user.id}>`,
      embeds: [alertEmbed],
      components: [ticketAlertRow],
    });
    if (config.alertDMEmbed.enabled) {
      const defaultDMValues = {
        color: "#FF0000",
        title: "Ticket Close Notification",
        description:
          "Your ticket **#{ticketName}** in **{server}** will be closed soon if no response has been received.",
      };

      const alertDMEmbed = await configEmbed("alertDMEmbed", defaultDMValues);

      if (alertDMEmbed.data && alertDMEmbed.data.description) {
        alertDMEmbed.setDescription(
          alertDMEmbed.data.description
            .replace(/\{ticketName\}/g, `${interaction.channel.name}`)
            .replace(/\{server\}/g, `${interaction.guild.name}`),
        );
      }

      try {
        await user.send({ embeds: [alertDMEmbed] });
      } catch (error) {
        const defaultErrorValues = {
          color: "#FF0000",
          title: "DMs Disabled",
          description:
            "Please enable `Allow Direct Messages` in this server to receive further information from the bot!\n\nFor help, please read [this article](https://support.discord.com/hc/en-us/articles/217916488-Blocking-Privacy-Settings).",
        };

        const dmErrorEmbed = await configEmbed(
          "dmErrorEmbed",
          defaultErrorValues,
        );

        let logChannelId = config.logs.DMErrors || config.logs.default;
        let logChannel = client.channels.cache.get(logChannelId);
        await logChannel.send({ embeds: [dmErrorEmbed] });
        logMessage(
          `The bot could not DM ${user.tag} because their DMs were closed`,
        );
      }
    }
    logMessage(
      `${interaction.user.tag} sent an alert to ${user.tag} in the ticket #${interaction.channel.name}`,
    );
  },
};
