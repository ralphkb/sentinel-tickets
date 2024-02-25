const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const fs = require("fs");
const yaml = require("yaml");
const configFile = fs.readFileSync("./config.yml", "utf8");
const config = yaml.parse(configFile);
const {
  client,
  ticketsDB,
  sanitizeInput,
  logMessage,
  saveTranscript,
  saveTranscriptTxt,
  checkSupportRole,
  configEmbed,
} = require("../../index.js");

module.exports = {
  enabled: config.commands.transcript.enabled,
  data: new SlashCommandBuilder()
    .setName("transcript")
    .setDescription("Manually save the transcript of a ticket.")
    .setDefaultMemberPermissions(
      PermissionFlagsBits[config.commands.transcript.permission],
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
    await interaction.deferReply({ ephemeral: true });

    let ticketUserID = client.users.cache.get(
      await ticketsDB.get(`${interaction.channel.id}.userID`),
    );

    let attachment;
    if (config.transcriptType === "HTML") {
      attachment = await saveTranscript(interaction, null, true);
    } else if (config.transcriptType === "TXT") {
      attachment = await saveTranscriptTxt(interaction);
    }

    const logDefaultValues = {
      color: "#2FF200",
      title: "Ticket Transcript",
      description: `Saved by {user}`,
      timestamp: true,
      footer: {
        text: `${ticketUserID.tag}`,
        iconURL: `${ticketUserID.displayAvatarURL({ format: "png", dynamic: true, size: 1024 })}`,
      },
    };

    const transcriptEmbed = await configEmbed(
      "transcriptEmbed",
      logDefaultValues,
    );

    if (transcriptEmbed.data && transcriptEmbed.data.description) {
      transcriptEmbed.setDescription(
        transcriptEmbed.data.description.replace(/\{user\}/g, interaction.user),
      );
    }

    transcriptEmbed.addFields([
      {
        name: config.transcriptEmbed.field_creator,
        value: `<@!${ticketUserID.id}>\n${sanitizeInput(ticketUserID.tag)}`,
        inline: true,
      },
      {
        name: config.transcriptEmbed.field_ticket,
        value: `<#${interaction.channel.id}>\n${sanitizeInput(interaction.channel.name)}`,
        inline: true,
      },
      {
        name: config.transcriptEmbed.field_category,
        value: `${await ticketsDB.get(`${interaction.channel.id}.ticketType`)}`,
        inline: true,
      },
    ]);

    let logChannelId = config.logs.transcripts || config.logs.default;
    let logChannel = interaction.guild.channels.cache.get(logChannelId);
    await logChannel.send({ embeds: [transcriptEmbed], files: [attachment] });
    interaction.editReply({
      content: `Transcript saved to <#${logChannel.id}>`,
      ephemeral: true,
    });
    logMessage(
      `${interaction.user.tag} manually saved the transcript of ticket #${interaction.channel.name} which was created by ${ticketUserID.tag}`,
    );
  },
};
