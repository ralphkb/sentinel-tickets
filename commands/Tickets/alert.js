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
  sanitizeInput,
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

    if (config.alertReply.enabled) {
      const filter = (m) => m.author.id === user.id;
      const collectorTimeInSeconds = config.alertReply.time || 120;
      const collector = interaction.channel.createMessageCollector({
        filter,
        max: 1,
        time: collectorTimeInSeconds * 1000,
      });

      collector.on("collect", () => {
        interaction.deleteReply();
        interaction.channel.send(
          config.alertReply.reply ||
            "The user replied to the alert and seems to be available.",
        );
        collector.stop();
      });
    }

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
            "The bot could not DM **{user} ({user.tag})** because their DMs were closed.\nPlease enable `Allow Direct Messages` in this server to receive further information from the bot!\n\nFor help, please read [this article](https://support.discord.com/hc/en-us/articles/217916488-Blocking-Privacy-Settings).",
          timestamp: true,
          thumbnail: `${user.displayAvatarURL({ extension: "png", size: 1024 })}`,
          footer: {
            text: `${user.tag}`,
            iconURL: `${user.displayAvatarURL({ extension: "png", size: 1024 })}`,
          },
        };

        const dmErrorEmbed = await configEmbed(
          "dmErrorEmbed",
          defaultErrorValues,
        );

        if (dmErrorEmbed.data && dmErrorEmbed.data.description) {
          dmErrorEmbed.setDescription(
            dmErrorEmbed.data.description
              .replace(/\{user\}/g, user)
              .replace(/\{user\.tag\}/g, sanitizeInput(user.tag)),
          );
        }

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
