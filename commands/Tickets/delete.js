const {
  EmbedBuilder,
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

    let ticketUserID = client.users.cache.get(
      await ticketsDB.get(`${interaction.channel.id}.userID`),
    );
    let claimUser = client.users.cache.get(
      await ticketsDB.get(`${interaction.channel.id}.claimUser`),
    );
    let ticketType = await ticketsDB.get(
      `${interaction.channel.id}.ticketType`,
    );

    const logEmbed = new EmbedBuilder()
      .setColor(config.commands.delete.LogEmbed.color)
      .setTitle(config.commands.delete.LogEmbed.title)
      .addFields([
        {
          name: config.commands.delete.LogEmbed.field_staff,
          value: `> <@!${interaction.user.id}>\n> ${sanitizeInput(interaction.user.tag)}`,
        },
        {
          name: config.commands.delete.LogEmbed.field_user,
          value: `> <@!${ticketUserID.id}>\n> ${sanitizeInput(ticketUserID.tag)}`,
        },
        {
          name: config.commands.delete.LogEmbed.field_ticket,
          value: `> #${sanitizeInput(interaction.channel.name)}\n> ${ticketType}`,
        },
      ])
      .setTimestamp()
      .setThumbnail(
        interaction.user.displayAvatarURL({
          format: "png",
          dynamic: true,
          size: 1024,
        }),
      )
      .setFooter({
        text: `${interaction.user.tag}`,
        iconURL: `${interaction.user.displayAvatarURL({ format: "png", dynamic: true, size: 1024 })}`,
      });

    if (claimUser)
      logEmbed.addFields({
        name: "• Claimed By",
        value: `> <@!${claimUser.id}>\n> ${sanitizeInput(claimUser.tag)}`,
      });

    let attachment;
    if (config.transcriptType === "HTML") {
      attachment = await saveTranscript(interaction);
    } else if (config.transcriptType === "TXT") {
      attachment = await saveTranscriptTxt(interaction);
    }

    let logsChannel = interaction.guild.channels.cache.get(
      config.logs_channel_id,
    );
    await logsChannel.send({ embeds: [logEmbed], files: [attachment] });
    logMessage(
      `${interaction.user.tag} deleted the ticket #${interaction.channel.name} which was created by ${ticketUserID.tag}`,
    );

    const deleteTicketTime = config.deleteTicketTime;
    const deleteTime = deleteTicketTime * 1000;

    const deleteEmbed = new EmbedBuilder()
      .setColor(config.commands.delete.embed.color)
      .setDescription(
        `${config.commands.delete.embed.description}`.replace(
          /\{time\}/g,
          `${deleteTicketTime}`,
        ),
      );

    // DM the user with an embed and the transcript of the ticket if the option is enabled
    if (config.DMUserSettings.enabled) {
      const dmEmbed = new EmbedBuilder()
        .setColor(config.DMUserSettings.embed.color)
        .setTitle(config.DMUserSettings.embed.title)
        .setThumbnail(interaction.guild.iconURL())
        .setDescription(config.DMUserSettings.embed.description)
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

      const ratingEmbed = new EmbedBuilder()
        .setColor(config.DMUserSettings.ratingSystem.embed.color)
        .setTitle(config.DMUserSettings.ratingSystem.embed.title)
        .setDescription(config.DMUserSettings.ratingSystem.embed.description)
        .setFooter({
          text: `Ticket: #${interaction.channel.name} | Category: ${await ticketsDB.get(`${interaction.channel.id}.ticketType`)}`,
        });

      if (config.DMUserSettings.ratingSystem.enabled === false) {
        await ticketUserID.send({ embeds: [dmEmbed], files: [attachment] });
      }
      if (config.DMUserSettings.ratingSystem.enabled === true) {
        await mainDB.set(`ratingMenuOptions`, options);
        await ticketUserID.send({
          embeds: [dmEmbed],
          files: [attachment],
        });
        await ticketUserID.send({
          embeds: [ratingEmbed],
          components: [actionRowMenu],
        });
      }
    }

    await interaction.reply({ embeds: [deleteEmbed] });

    setTimeout(async () => {
      await ticketsDB.delete(interaction.channel.id);
      await mainDB.pull("openTickets", interaction.channel.id);
      await interaction.channel.delete();
    }, deleteTime);
  },
};
