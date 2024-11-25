const {
  StringSelectMenuOptionBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
} = require("discord.js");
const dotenv = require("dotenv");
dotenv.config();
const fs = require("fs");
const yaml = require("yaml");
const configFile = fs.readFileSync("./config.yml", "utf8");
const config = yaml.parse(configFile);
const { mainDB, ticketsDB, client } = require("../init.js");
const {
  configEmbed,
  getUser,
  sanitizeInput,
  logMessage,
  getUserPreference,
  saveTranscript,
  saveTranscriptTxt,
  countMessagesInTicket,
  getChannel,
  lastUserMsgTimestamp,
} = require("./mainUtils.js");

async function autoDeleteTicket(channelID) {
  const ticketChannel = await getChannel(channelID);
  const channelName = ticketChannel.name;
  const ticketUserID = await getUser(
    await ticketsDB.get(`${channelID}.userID`),
  );
  const claimUserID = await ticketsDB.get(`${channelID}.claimUser`);
  let claimUser;

  if (claimUserID) {
    claimUser = await getUser(claimUserID);
  }
  const ticketType = await ticketsDB.get(`${channelID}.ticketType`);
  const ticketStatus = await ticketsDB.get(`${channelID}.status`);

  const logDefaultValues = {
    color: "#FF0000",
    title: "Ticket Logs | Ticket Deleted",
    timestamp: true,
    thumbnail: `${client.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
    footer: {
      text: `${client.user.tag}`,
      iconURL: `${client.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
    },
  };

  const logAutoDeleteEmbed = await configEmbed(
    "logAutoDeleteEmbed",
    logDefaultValues,
  );

  logAutoDeleteEmbed.addFields([
    {
      name: config.logAutoDeleteEmbed.field_staff || "• Auto Deleted By",
      value: `> <@!${client.user.id}>\n> ${sanitizeInput(client.user.tag)}`,
    },
    {
      name: config.logAutoDeleteEmbed.field_user || "• Ticket Creator",
      value: `> <@!${ticketUserID.id}>\n> ${sanitizeInput(ticketUserID.tag)}`,
    },
    {
      name: config.logAutoDeleteEmbed.field_ticket || "• Ticket",
      value: `> #${sanitizeInput(channelName)}\n> ${ticketType}`,
    },
    {
      name: config.logAutoDeleteEmbed.field_creation || "• Creation Time",
      value: `> <t:${await ticketsDB.get(`${channelID}.creationTime`)}:F>`,
    },
  ]);

  const closedAt = await ticketsDB.get(`${channelID}.closedAt`);
  if (closedAt !== 0 && closedAt !== undefined) {
    const closedTime = Math.floor(closedAt / 1000);
    logAutoDeleteEmbed.addFields({
      name: config.logAutoDeleteEmbed.field_closedAt || "• Closed at",
      value: `> <t:${closedTime}:F>`,
    });
  }

  if (claimUser) {
    logAutoDeleteEmbed.addFields({
      name: config.logAutoDeleteEmbed.field_claimedBy || "• Claimed By",
      value: `> <@!${claimUser.id}>\n> ${sanitizeInput(claimUser.tag)}`,
    });
  }

  let attachment;
  const transcriptType = config.transcriptType || "HTML";
  const transcriptImages =
    config.transcriptImages !== undefined ? config.transcriptImages : false;
  if (transcriptType === "HTML") {
    attachment = await saveTranscript(
      null,
      ticketChannel,
      transcriptImages,
      ticketUserID,
    );
  } else if (transcriptType === "TXT") {
    attachment = await saveTranscriptTxt(null, ticketChannel, ticketUserID);
  }

  const deleteTicketTime =
    config.deleteTicketTime >= 0 ? config.deleteTicketTime : 5;
  const deleteTime = deleteTicketTime * 1000;

  const defaultValues = {
    color: "#FF0000",
    description: "Deleting ticket in {time} seconds",
  };

  const autoDeleteEmbed = await configEmbed("autoDeleteEmbed", defaultValues);

  if (autoDeleteEmbed.data && autoDeleteEmbed.data.description) {
    autoDeleteEmbed.setDescription(
      autoDeleteEmbed.data.description.replace(
        /\{time\}/g,
        `${deleteTicketTime}`,
      ),
    );
  }

  const ticketMessages = await countMessagesInTicket(ticketChannel);
  await mainDB.add("totalMessages", ticketMessages);
  const lastMsgTime = await lastUserMsgTimestamp(ticketUserID.id, channelID);
  await ticketChannel.send({ embeds: [autoDeleteEmbed] });

  setTimeout(async () => {
    if (ticketStatus === "Open") {
      await mainDB.sub("openTickets", 1);
    }
    await ticketsDB.delete(channelID);
    await ticketChannel.delete();
  }, deleteTime);

  let logChannelId = config.logs.ticketDelete || config.logs.default;
  let logsChannel = await getChannel(logChannelId);
  if (config.toggleLogs.ticketDelete) {
    try {
      await logsChannel.send({
        embeds: [logAutoDeleteEmbed],
        files: [attachment],
      });
    } catch (error) {
      error.errorContext = `[Logging Error]: please make sure to at least configure your default log channel`;
      client.emit("error", error);
    }
  }
  await logMessage(
    `${client.user.tag} automatically deleted the ticket #${channelName} which was created by ${ticketUserID.tag}`,
  );

  // DM the user with an embed and the transcript of the ticket depending on the enabled settings
  const sendEmbed = config.DMUserSettings.embed;
  const sendTranscript = config.DMUserSettings.transcript;
  const sendRatingSystem = config.DMUserSettings.ratingSystem.enabled;
  const guild = client.guilds.cache.get(process.env.GUILD_ID);
  const userPreference = await getUserPreference(ticketUserID.id, "delete");
  if (userPreference) {
    if (sendEmbed || sendTranscript || sendRatingSystem) {
      const defaultDMValues = {
        color: "#2FF200",
        title: "Ticket Deleted",
        description:
          "Your support ticket has been deleted. Here is your transcript and other information.",
        thumbnail: `${guild.iconURL()}`,
        timestamp: true,
      };

      const deleteDMEmbed = await configEmbed("deleteDMEmbed", defaultDMValues);

      deleteDMEmbed
        .addFields(
          {
            name: config.deleteDMEmbed.field_server || "Server",
            value: `> ${guild.name}`,
            inline: true,
          },
          {
            name: config.deleteDMEmbed.field_ticket || "Ticket",
            value: `> #${sanitizeInput(channelName)}`,
            inline: true,
          },
          {
            name: config.deleteDMEmbed.field_category || "Category",
            value: `> ${ticketType}`,
            inline: true,
          },
        )
        .addFields(
          {
            name: config.deleteDMEmbed.field_author || "Ticket Author",
            value: `> ${sanitizeInput(ticketUserID.tag)}`,
            inline: true,
          },
          {
            name: config.deleteDMEmbed.field_deletedBy || "Deleted By",
            value: `> ${sanitizeInput(client.user.tag)}`,
            inline: true,
          },
          {
            name: config.deleteDMEmbed.field_claimedBy || "Claimed By",
            value: `> ${claimUser ? sanitizeInput(claimUser.tag) : "None"}`,
            inline: true,
          },
        )
        .addFields({
          name: config.deleteDMEmbed.field_creation || "Ticket Creation Time",
          value: `> <t:${await ticketsDB.get(`${channelID}.creationTime`)}:F>`,
          inline: true,
        });

      if (closedAt !== 0 && closedAt !== undefined) {
        const closedTime = Math.floor(closedAt / 1000);
        deleteDMEmbed.addFields({
          name: config.deleteDMEmbed.field_closedAt || "Closed at",
          value: `> <t:${closedTime}:F>`,
          inline: true,
        });
      }

      const options = [];
      for (let i = 1; i <= 5; i++) {
        const option = new StringSelectMenuOptionBuilder()
          .setLabel(`${i} ${i > 1 ? "stars" : "star"}`)
          .setEmoji(config.DMUserSettings.ratingSystem.menu.emoji)
          .setValue(`${i}-star`);

        options.push(option);
      }

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("ratingMenu")
        .setPlaceholder(config.DMUserSettings.ratingSystem.menu.placeholder)
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(options);

      const actionRowMenu = new ActionRowBuilder().addComponents(selectMenu);

      const defaultRatingValues = {
        color: "#2FF200",
        title: "Ticket Feedback & Rating",
        description:
          "We value your feedback! Please take a moment to share your thoughts and rate our support system. Your rating can be between 1 and 5 stars by using the select menu below. Thank you for helping us improve.",
      };

      const ratingDMEmbed = await configEmbed(
        "ratingDMEmbed",
        defaultRatingValues,
      );

      ratingDMEmbed.setFooter({
        text: `Ticket: #${channelName} | Category: ${await ticketsDB.get(`${channelID}.ticketType`)}`,
      });

      const messageDM = {};

      if (sendEmbed) {
        messageDM.embeds = [deleteDMEmbed];
      }

      if (sendTranscript) {
        messageDM.files = [attachment];
      }

      try {
        if (sendRatingSystem === false) {
          await ticketUserID.send(messageDM);
        }
        if (sendRatingSystem === true) {
          if (Object.keys(messageDM).length !== 0) {
            await ticketUserID.send(messageDM).catch(() => {
              // Stops the useless console logging
            });
          }
          if (lastMsgTime !== null) {
            await mainDB.set(`ratingMenuOptions`, options);
            await ticketUserID.send({
              embeds: [ratingDMEmbed],
              components: [actionRowMenu],
            });
          }
        }
      } catch (error) {
        error.errorContext = `[Delete Slash Command Error]: failed to DM ${ticketUserID.tag} because their DMs were closed.`;
        client.emit("error", error);
        const defaultErrorValues = {
          color: "#FF0000",
          title: "DMs Disabled",
          description:
            "The bot could not DM **{user} ({user.tag})** because their DMs were closed.\nPlease enable `Allow Direct Messages` in this server to receive further information from the bot!\n\nFor help, please read [this article](https://support.discord.com/hc/en-us/articles/217916488-Blocking-Privacy-Settings).",
          timestamp: true,
          thumbnail: `${ticketUserID.displayAvatarURL({ extension: "png", size: 1024 })}`,
          footer: {
            text: `${ticketUserID.tag}`,
            iconURL: `${ticketUserID.displayAvatarURL({ extension: "png", size: 1024 })}`,
          },
        };

        const dmErrorEmbed = await configEmbed(
          "dmErrorEmbed",
          defaultErrorValues,
        );

        if (dmErrorEmbed.data && dmErrorEmbed.data.description) {
          dmErrorEmbed.setDescription(
            dmErrorEmbed.data.description
              .replace(/\{user\}/g, ticketUserID)
              .replace(/\{user\.tag\}/g, sanitizeInput(ticketUserID.tag)),
          );
        }

        let logChannelId = config.logs.DMErrors || config.logs.default;
        let logChannel = await getChannel(logChannelId);

        let dmErrorReply = {
          embeds: [dmErrorEmbed],
        };

        if (config.dmErrorEmbed.pingUser) {
          dmErrorReply.content = `<@${ticketUserID.id}>`;
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
          `The bot could not DM ${ticketUserID.tag} because their DMs were closed`,
        );
      }
    }
  }
}

module.exports = {
  autoDeleteTicket,
};
