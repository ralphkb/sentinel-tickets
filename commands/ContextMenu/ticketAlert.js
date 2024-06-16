const {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
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
  getUser,
  getUserPreference,
} = require("../../index.js");

module.exports = {
  enabled: config.contextMenuCommands.ticketAlert.enabled,
  data: new ContextMenuCommandBuilder()
    .setName("Ticket Alert")
    .setType(ApplicationCommandType.User)
    .setDefaultMemberPermissions(
      PermissionFlagsBits[config.contextMenuCommands.ticketAlert.permission],
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

    const member = interaction.targetMember;
    const user =
      member.user ||
      (await getUser(await ticketsDB.get(`${interaction.channel.id}.userID`)));

    if (user.bot) {
      return interaction.reply({
        content: "You cannot send a ticket alert to a bot.",
        ephemeral: true,
      });
    }

    if (!interaction.channel.members.has(user.id)) {
      return interaction.reply({
        content: "The selected user is not added to this ticket!",
        ephemeral: true,
      });
    }

    await interaction.deferReply();

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

    await interaction
      .editReply({
        embeds: [alertEmbed],
        components: [ticketAlertRow],
      })
      .then(async () => {
        await interaction.followUp(`<@${user.id}>`);
      })
      .catch((error) => {
        console.error(`[ContextMenu: Ticket Alert] Error: ${error}`);
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

    logMessage(
      `${interaction.user.tag} sent an alert to ${user.tag} in the ticket #${interaction.channel.name}`,
    );

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

      const userPreference = await getUserPreference(user.id, "alert");
      if (userPreference) {
        try {
          await user.send({ embeds: [alertDMEmbed] });
        } catch (error) {
          error.errorContext = `[TicketAlert Context Menu Command Error]: failed to DM ${user.tag} because their DMs were closed.`;
          client.emit("error", error);
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

          let dmErrorReply = {
            embeds: [dmErrorEmbed],
          };

          if (config.dmErrorEmbed.pingUser) {
            dmErrorReply.content = `<@${user.id}>`;
          }

          if (config.toggleLogs.DMErrors) {
            try {
              await logChannel.send(dmErrorReply);
            } catch (error) {
              error.errorContext = `[Logging Error]: please make sure to at least configure your default log channel`;
              client.emit("error", error);
            }
          }
          logMessage(
            `The bot could not DM ${user.tag} because their DMs were closed`,
          );
        }
      }
    }
  },
};
