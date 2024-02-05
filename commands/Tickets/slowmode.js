const {
  EmbedBuilder,
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const fs = require('fs');
const yaml = require('yaml');
const configFile = fs.readFileSync('./config.yml', 'utf8');
const config = yaml.parse(configFile);
const { ticketsDB, logMessage, formatTime } = require('../../index.js');

module.exports = {
  enabled: config.commands.slowmode.enabled,
  data: new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('Add slowmode to a ticket channel.')
    .setDefaultMemberPermissions(
      PermissionFlagsBits[config.commands.slowmode.permission],
    )
    .addIntegerOption((option) =>
      option
        .setName('time')
        .setDescription('Input a time in seconds')
        .setRequired(true)
        .setMaxValue(21600),
    )
    .setDMPermission(false),
  async execute(interaction) {
    if (!(await ticketsDB.has(interaction.channel.id))) {
      return interaction.reply({
        content: config.errors.not_in_a_ticket,
        ephemeral: true,
      });
    }

    if (
      !interaction.member.roles.cache.some((role) =>
        config.support_role_ids.includes(role.id),
      )
    ) {
      return interaction.reply({
        content: config.errors.not_allowed,
        ephemeral: true,
      });
    }

    const time = interaction.options.getInteger('time');
    const currentSlowmode = interaction.channel.rateLimitPerUser;

    if (currentSlowmode === time) {
      return interaction.reply({
        content: config.commands.slowmode.alreadySlowmode,
        ephemeral: true,
      });
    }

    if (time === 0) {
      await interaction.channel.setRateLimitPerUser(0);
      return interaction.reply({
        content: config.commands.slowmode.slowmodeRemoved,
        ephemeral: true,
      });
    }

    await interaction.channel.setRateLimitPerUser(time);
    const formattedTime = formatTime(time);

    const embed = new EmbedBuilder()
      .setColor(config.commands.slowmode.embed.color)
      .setDescription(
        `${config.commands.slowmode.embed.description}`.replace(
          /\{time\}/g,
          formattedTime,
        ),
      );
    interaction.reply({ embeds: [embed] });
    logMessage(
      `${interaction.user.tag} added a slow mode of ${formattedTime} to the ticket #${interaction.channel.name}`,
    );
  },
};
