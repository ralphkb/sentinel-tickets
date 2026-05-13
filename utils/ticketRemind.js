const { client, ticketsDB } = require("../init.js");
const {
  configEmbed,
  sanitizeInput,
  logMessage,
  getChannel,
  getUserPreference,
  getUser,
  logError,
} = require("./mainUtils.js");

async function remindTicket(interaction, user) {
  const logDefaultValues = {
    color: "#2FF200",
    title: "Ticket Logs | Ticket Reminder",
    timestamp: true,
    thumbnail: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
    footer: {
      text: `${interaction.user.tag}`,
      iconURL: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
    },
  };

  const logRemindEmbed = await configEmbed("logRemindEmbed", logDefaultValues);
  const ticketType = await ticketsDB.get(
    `${interaction.channel.id}.ticketType`,
  );
  const ticketCreator = await getUser(
    await ticketsDB.get(`${interaction.channel.id}.userID`),
  );

  logRemindEmbed.addFields([
    {
      name: config.logRemindEmbed.field_staff || "• Reminder Sent By",
      value: `> <@!${interaction.user.id}>\n> ${sanitizeInput(interaction.user.tag)}`,
    },
    {
      name: config.logRemindEmbed.field_user || "• Reminder Sent To",
      value: `> <@!${user.id}>\n> ${sanitizeInput(user.tag)}`,
    },
    {
      name: config.logRemindEmbed.field_creator || "• Ticket Creator",
      value: `> <@!${ticketCreator.id}>\n> ${sanitizeInput(ticketCreator.tag)}`,
    },
    {
      name: config.logRemindEmbed.field_ticket || "• Ticket",
      value: `> #${sanitizeInput(interaction.channel.name)}\n> ${ticketType}`,
    },
  ]);

  const defaultValues = {
    color: "#2FF200",
    title: "Ticket Reminder",
    description:
      "This is a friendly reminder regarding your open ticket. Please provide an update when you are available so we may assist you further.",
    timestamp: true,
  };

  const remindEmbed = await configEmbed("remindEmbed", defaultValues);

  if (remindEmbed.data && remindEmbed.data.description) {
    remindEmbed.setDescription(
      remindEmbed.data.description.replace(/\{user\}/g, `<@!${user.id}>`),
    );
  }

  if (config.commands.remind.sendTicketMessage) {
    await interaction
      .editReply({
        embeds: [remindEmbed],
      })
      .catch((error) => {
        console.error(`[Slash Command: Remind] Error: ${error}`);
      });
  } else {
    await interaction
      .editReply({
        content: "The reminder has been sent to the user's DMs.",
      })
      .catch((error) => {
        console.error(`[Slash Command: Remind] Error: ${error}`);
      });
  }

  let logChannelId = config.logs.ticketRemind || config.logs.default;
  let logsChannel = await getChannel(logChannelId);
  if (config.toggleLogs.ticketRemind) {
    try {
      await logsChannel.send({ embeds: [logRemindEmbed] });
    } catch (error) {
      error.errorContext = `[Logging Error]: please make sure to at least configure your default log channel`;
      client.emit("error", error);
    }
  }

  await logMessage(
    `${interaction.user.tag} sent a reminder to ${user.tag} in the ticket #${interaction.channel.name}`,
  );

  if (config.remindDMEmbed.enabled) {
    const defaultDMValues = {
      color: "#2FF200",
      title: "Ticket Reminder",
      description:
        "This is a reminder that you have an active support ticket (**#{ticketName}**) in **{server}**. We are awaiting your response to proceed with your request. Please check the ticket for further details.",
    };

    const remindDMEmbed = await configEmbed("remindDMEmbed", defaultDMValues);

    if (remindDMEmbed.data && remindDMEmbed.data.description) {
      remindDMEmbed.setDescription(
        remindDMEmbed.data.description
          .replace(/\{ticketName\}/g, `${interaction.channel.name}`)
          .replace(/\{server\}/g, `${interaction.guild.name}`),
      );
    }

    const userPreference = await getUserPreference(user.id, "remind");
    if (userPreference) {
      try {
        await user.send({ embeds: [remindDMEmbed] });
      } catch (error) {
        error.errorContext = `[Remind Slash Command Error]: failed to DM ${user.tag} because their DMs were closed.`;
        await logError("ERROR", error);
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
        let logChannel = await getChannel(logChannelId);

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
}

module.exports = {
  remindTicket,
};
