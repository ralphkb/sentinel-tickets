const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  StringSelectMenuOptionBuilder,
  StringSelectMenuBuilder,
} = require("discord.js");
const fs = require("fs");
const yaml = require("yaml");
const configFile = fs.readFileSync("./config.yml", "utf8");
const config = yaml.parse(configFile);
const {
  client,
  ticketsDB,
  mainDB,
  saveTranscript,
  sanitizeInput,
  logMessage,
  saveTranscriptTxt,
  checkSupportRole,
  configEmbed,
} = require("../../index.js");

module.exports = {
  enabled: config.commands.delete.enabled,
  data: new SlashCommandBuilder()
    .setName("delete")
    .setDescription("Delete a ticket.")
    .setDefaultMemberPermissions(
      PermissionFlagsBits[config.commands.delete.permission],
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
    let ticketUserID = client.users.cache.get(
      await ticketsDB.get(`${interaction.channel.id}.userID`),
    );
    let claimUser = client.users.cache.get(
      await ticketsDB.get(`${interaction.channel.id}.claimUser`),
    );
    let ticketType = await ticketsDB.get(
      `${interaction.channel.id}.ticketType`,
    );

    const logDefaultValues = {
      color: "#FF0000",
      title: "Ticket Logs | Ticket Deleted",
      timestamp: true,
      thumbnail: `${interaction.user.displayAvatarURL({ format: "png", dynamic: true, size: 1024 })}`,
      footer: {
        text: `${interaction.user.tag}`,
        iconURL: `${interaction.user.displayAvatarURL({ format: "png", dynamic: true, size: 1024 })}`,
      },
    };

    const logDeleteEmbed = await configEmbed(
      "logDeleteEmbed",
      logDefaultValues,
    );

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

    let logChannelId = config.logs.ticketDelete || config.logs.default;
    let logsChannel = interaction.guild.channels.cache.get(logChannelId);
    await logsChannel.send({ embeds: [logDeleteEmbed], files: [attachment] });
    logMessage(
      `${interaction.user.tag} deleted the ticket #${interaction.channel.name} which was created by ${ticketUserID.tag}`,
    );

    const deleteTicketTime = config.deleteTicketTime || 5;
    const deleteTime = deleteTicketTime * 1000;

    const defaultValues = {
      color: "#FF0000",
      description: "Deleting ticket in {time} seconds",
    };

    const deleteEmbed = await configEmbed("deleteEmbed", defaultValues);

    if (deleteEmbed.data && deleteEmbed.data.description) {
      deleteEmbed.setDescription(
        deleteEmbed.data.description.replace(
          /\{time\}/g,
          `${deleteTicketTime}`,
        ),
      );
    }

    // DM the user with an embed and the transcript of the ticket if the option is enabled
    if (config.DMUserSettings.enabled) {
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
        );

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

      try {
        if (config.DMUserSettings.ratingSystem.enabled === false) {
          await ticketUserID.send({
            embeds: [deleteDMEmbed],
            files: [attachment],
          });
        }
        if (config.DMUserSettings.ratingSystem.enabled === true) {
          await mainDB.set(`ratingMenuOptions`, options);
          await ticketUserID.send({
            embeds: [deleteDMEmbed],
            files: [attachment],
          });
          await ticketUserID.send({
            embeds: [ratingDMEmbed],
            components: [actionRowMenu],
          });
        }
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
          `The bot could not DM ${ticketUserID.tag} because their DMs were closed`,
        );
      }
    }

    await interaction.editReply({ embeds: [deleteEmbed] });

    setTimeout(async () => {
      await ticketsDB.delete(interaction.channel.id);
      await mainDB.pull("openTickets", interaction.channel.id);
      await interaction.channel.delete();
    }, deleteTime);
  },
};
