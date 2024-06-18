const {
  StringSelectMenuOptionBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
} = require("discord.js");
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
} = require("./mainUtils.js");

async function deleteTicket(interaction) {
  const totalMessages = await mainDB.get("totalMessages");
  const ticketUserID = await getUser(
    await ticketsDB.get(`${interaction.channel.id}.userID`),
  );
  const claimUserID = await ticketsDB.get(
    `${interaction.channel.id}.claimUser`,
  );
  let claimUser;

  if (claimUserID) {
    claimUser = await getUser(claimUserID);
  }
  const ticketType = await ticketsDB.get(
    `${interaction.channel.id}.ticketType`,
  );

  const logDefaultValues = {
    color: "#FF0000",
    title: "Ticket Logs | Ticket Deleted",
    timestamp: true,
    thumbnail: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
    footer: {
      text: `${interaction.user.tag}`,
      iconURL: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
    },
  };

  const logDeleteEmbed = await configEmbed("logDeleteEmbed", logDefaultValues);

  logDeleteEmbed.addFields([
    {
      name: config.logDeleteEmbed.field_staff,
      value: `> <@!${interaction.user.id}>\n> ${sanitizeInput(interaction.user.tag)}`,
    },
    {
      name: config.logDeleteEmbed.field_user,
      value: `> <@!${ticketUserID.id}>\n> ${sanitizeInput(ticketUserID.tag)}`,
    },
    {
      name: config.logDeleteEmbed.field_ticket,
      value: `> #${sanitizeInput(interaction.channel.name)}\n> ${ticketType}`,
    },
    {
      name: config.logDeleteEmbed.field_creation,
      value: `> <t:${await ticketsDB.get(`${interaction.channel.id}.creationTime`)}:F>`,
    },
  ]);

  if (claimUser)
    logDeleteEmbed.addFields({
      name: "• Claimed By",
      value: `> <@!${claimUser.id}>\n> ${sanitizeInput(claimUser.tag)}`,
    });

  let attachment;
  const transcriptType = config.transcriptType || "HTML";
  if (transcriptType === "HTML") {
    attachment = await saveTranscript(interaction);
  } else if (transcriptType === "TXT") {
    attachment = await saveTranscriptTxt(interaction);
  }

  const deleteTicketTime = config.deleteTicketTime || 5;
  const deleteTime = deleteTicketTime * 1000;

  const defaultValues = {
    color: "#FF0000",
    description: "Deleting ticket in {time} seconds",
  };

  const deleteEmbed = await configEmbed("deleteEmbed", defaultValues);

  if (deleteEmbed.data && deleteEmbed.data.description) {
    deleteEmbed.setDescription(
      deleteEmbed.data.description.replace(/\{time\}/g, `${deleteTicketTime}`),
    );
  }

  const ticketMessages = await countMessagesInTicket(interaction.channel);
  await mainDB.set("totalMessages", totalMessages + ticketMessages);
  await interaction.editReply({ embeds: [deleteEmbed] });

  setTimeout(async () => {
    await ticketsDB.delete(interaction.channel.id);
    await mainDB.pull("openTickets", interaction.channel.id);
    await interaction.channel.delete();
  }, deleteTime);

  let logChannelId = config.logs.ticketDelete || config.logs.default;
  let logsChannel = await getChannel(logChannelId);
  if (config.toggleLogs.ticketDelete) {
    try {
      await logsChannel.send({ embeds: [logDeleteEmbed], files: [attachment] });
    } catch (error) {
      error.errorContext = `[Logging Error]: please make sure to at least configure your default log channel`;
      client.emit("error", error);
    }
  }
  logMessage(
    `${interaction.user.tag} deleted the ticket #${interaction.channel.name} which was created by ${ticketUserID.tag}`,
  );

  // DM the user with an embed and the transcript of the ticket depending on the enabled settings
  const sendEmbed = config.DMUserSettings.embed;
  const sendTranscript = config.DMUserSettings.transcript;
  const sendRatingSystem = config.DMUserSettings.ratingSystem.enabled;
  const userPreference = await getUserPreference(ticketUserID.id, "delete");
  if (userPreference) {
    if (sendEmbed || sendTranscript || sendRatingSystem) {
      const defaultDMValues = {
        color: "#2FF200",
        title: "Ticket Deleted",
        description:
          "Your support ticket has been deleted. Here is your transcript and other information.",
        thumbnail: interaction.guild.iconURL(),
        timestamp: true,
      };

      const deleteDMEmbed = await configEmbed("deleteDMEmbed", defaultDMValues);

      deleteDMEmbed
        .addFields(
          {
            name: "Server",
            value: `> ${interaction.guild.name}`,
            inline: true,
          },
          {
            name: "Ticket",
            value: `> #${sanitizeInput(interaction.channel.name)}`,
            inline: true,
          },
          {
            name: "Category",
            value: `> ${ticketType}`,
            inline: true,
          },
        )
        .addFields(
          {
            name: "Ticket Author",
            value: `> ${sanitizeInput(ticketUserID.tag)}`,
            inline: true,
          },
          {
            name: "Deleted By",
            value: `> ${sanitizeInput(interaction.user.tag)}`,
            inline: true,
          },
          {
            name: "Claimed By",
            value: `> ${claimUser ? sanitizeInput(claimUser.tag) : "None"}`,
            inline: true,
          },
        )
        .addFields({
          name: "Ticket Creation Time",
          value: `> <t:${await ticketsDB.get(`${interaction.channel.id}.creationTime`)}:F>`,
          inline: true,
        });

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
        text: `Ticket: #${interaction.channel.name} | Category: ${await ticketsDB.get(`${interaction.channel.id}.ticketType`)}`,
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
            await ticketUserID.send(messageDM);
          }
          await mainDB.set(`ratingMenuOptions`, options);
          await ticketUserID.send({
            embeds: [ratingDMEmbed],
            components: [actionRowMenu],
          });
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
  deleteTicket,
};
