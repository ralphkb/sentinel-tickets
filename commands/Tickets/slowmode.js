const { EmbedBuilder, SlashCommandBuilder, PermissionFlagsBits } = require ("discord.js");
const fs = require('fs');
const yaml = require('yaml');
const configFile = fs.readFileSync('./config.yml', 'utf8');
const config = yaml.parse(configFile);
const { ticketsDB, logMessage } = require('../../index.js');

module.exports = {
    enabled: config.commands.slowmode.enabled,
    data: new SlashCommandBuilder()
        .setName('slowmode')
        .setDescription('Add slowmode to a ticket channel.')
        .setDefaultMemberPermissions(PermissionFlagsBits[config.commands.slowmode.permission])
        .addIntegerOption((option) => option.setName('time').setDescription('Input a time in seconds').setRequired(true).setMaxValue(21600))
        .setDMPermission(false),
    async execute(interaction) {

        if (!(await ticketsDB.has(interaction.channel.id))) {
            return interaction.reply({ content: config.errors.not_in_a_ticket, ephemeral: true });
          }

        if (!interaction.member.roles.cache.some((role) => config.support_role_ids.includes(role.id))) {
            return interaction.reply({ content: config.errors.not_allowed, ephemeral: true });
          };

        const time = interaction.options.getInteger('time');
        await interaction.channel.setRateLimitPerUser(time);

        const embed = new EmbedBuilder()
        .setColor(config.commands.slowmode.embed.color)
        .setDescription(`${config.commands.slowmode.embed.description}`.replace(/\{time\}/g, time))
        interaction.reply({ embeds: [embed] });
        logMessage(`${interaction.user.tag} added a slow mode of ${time} seconds to the ticket #${interaction.channel.name}`);

    }

}