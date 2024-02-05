const {
  EmbedBuilder,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} = require('discord.js');
const fs = require('fs');
const yaml = require('yaml');
const configFile = fs.readFileSync('./config.yml', 'utf8');
const config = yaml.parse(configFile);
const { ticketsDB, logMessage, client } = require('../../index.js');

module.exports = {
  enabled: config.commands.alert.enabled,
  data: new SlashCommandBuilder()
    .setName('alert')
    .setDescription('Alert the ticket creator.')
    .setDefaultMemberPermissions(
      PermissionFlagsBits[config.commands.alert.permission],
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

    const user = client.users.cache.get(
      await ticketsDB.get(`${interaction.channel.id}.userID`),
    );

    const closeButton = new ButtonBuilder()
      .setCustomId('closeTicket')
      .setLabel(config.closeButton.label)
      .setEmoji(config.closeButton.emoji)
      .setStyle(ButtonStyle[config.closeButton.style]);

    const ticketAlertRow = new ActionRowBuilder().addComponents(closeButton);

    const embed = new EmbedBuilder()
      .setColor(config.commands.alert.embed.color)
      .setTitle(config.commands.alert.embed.title)
      .setDescription(config.commands.alert.embed.description)
      .setTimestamp();

    interaction.reply({
      content: `<@${user.id}>`,
      embeds: [embed],
      components: [ticketAlertRow],
    });
    logMessage(
      `${interaction.user.tag} sent an alert to ${user.tag} in the ticket #${interaction.channel.name}`,
    );
  },
};
