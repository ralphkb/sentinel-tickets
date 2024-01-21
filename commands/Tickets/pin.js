const { EmbedBuilder, SlashCommandBuilder, PermissionFlagsBits } = require ("discord.js");
const fs = require('fs');
const yaml = require('yaml');
const configFile = fs.readFileSync('./config.yml', 'utf8');
const config = yaml.parse(configFile);
const { ticketsDB, logMessage } = require('../../index.js');

module.exports = {
    enabled: config.commands.pin.enabled,
    data: new SlashCommandBuilder()
        .setName('pin')
        .setDescription('Pin the ticket channel in the category.')
        .setDefaultMemberPermissions(PermissionFlagsBits[config.commands.pin.permission])
        .setDMPermission(false),
    async execute(interaction) {

        if (!(await ticketsDB.has(interaction.channel.id))) {
            return interaction.reply({ content: config.errors.not_in_a_ticket, ephemeral: true });
          }

        if (!interaction.member.roles.cache.some((role) => config.support_role_ids.includes(role.id))) {
            return interaction.reply({ content: config.errors.not_allowed, ephemeral: true });
          };

        if (interaction.channel.name.includes("📌")) {
            return interaction.reply({ content: "This ticket is already pinned!", ephemeral: true });
          };

          interaction.channel.setPosition(0)
          .then(() => {
              return new Promise(resolve => setTimeout(resolve, 1000));
          })
          .then(() => {
              interaction.channel.setName(`📌${interaction.channel.name}`);
          });

        const embed = new EmbedBuilder()
        .setColor(config.commands.pin.embed.color)
        .setDescription(`${config.commands.pin.embed.description}`)
        interaction.reply({ embeds: [embed] });
        logMessage(`${interaction.user.tag} pinned the ticket #${interaction.channel.name}`);

    }

}