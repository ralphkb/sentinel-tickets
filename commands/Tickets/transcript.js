const { EmbedBuilder, SlashCommandBuilder, PermissionFlagsBits } = require ("discord.js");
const fs = require('fs');
const yaml = require('yaml');
const configFile = fs.readFileSync('./config.yml', 'utf8');
const config = yaml.parse(configFile);
const { client, ticketsDB, sanitizeInput, logMessage, saveTranscript } = require('../../index.js');

module.exports = {
    enabled: config.commands.transcript.enabled,
    data: new SlashCommandBuilder()
        .setName('transcript')
        .setDescription("Manually save the transcript of a ticket.")
        .setDefaultMemberPermissions(PermissionFlagsBits[config.commands.transcript.permission])
        .setDMPermission(false),
    async execute(interaction) {

        if (!(await ticketsDB.has(interaction.channel.id))) {
            return interaction.reply({ content: config.errors.not_in_a_ticket, ephemeral: true });
          }

        if (!interaction.member.roles.cache.some((role) => config.support_role_ids.includes(role.id))) {
            return interaction.reply({ content: config.errors.not_allowed, ephemeral: true });
          };

          let ticketUserID = client.users.cache.get(await ticketsDB.get(`${interaction.channel.id}.userID`));
          let attachment = await saveTranscript(interaction, null, true);

          const embed = new EmbedBuilder()
          .setColor(config.default_embed_color)
          .setTitle("Ticket Transcript")
          .setDescription(`Saved by <@!${interaction.user.id}>`)
          .addFields([
              { name: "Ticket Creator", value: `<@!${ticketUserID.id}>\n${sanitizeInput(ticketUserID.tag)}`, inline: true },
              { name: "Ticket Name", value: `<#${interaction.channel.id}>\n${sanitizeInput(interaction.channel.name)}`, inline: true },
              { name: "Category", value: `${await ticketsDB.get(`${interaction.channel.id}.ticketType`)}`, inline: true },
            ])
          .setFooter({ text: `${ticketUserID.tag}`, iconURL: `${ticketUserID.displayAvatarURL({ dynamic: true })}` })
          .setTimestamp()

          let transcriptChannel = interaction.guild.channels.cache.get(config.transcripts_channel_id);
          transcriptChannel.send({ embeds: [embed], files: [attachment] });
          interaction.reply({ content: `Transcript saved to <#${transcriptChannel.id}>`, ephemeral: true });
          logMessage(`${interaction.user.tag} manually saved the transcript of ticket #${interaction.channel.name} which was created by ${ticketUserID.tag}`);

    }

}