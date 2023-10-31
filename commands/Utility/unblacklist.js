const { EmbedBuilder, SlashCommandBuilder, PermissionFlagsBits } = require ("discord.js");
const fs = require('fs');
const yaml = require('yaml');
const configFile = fs.readFileSync('./config.yml', 'utf8');
const config = yaml.parse(configFile);
const { mainDB } = require('../../index.js');

module.exports = {
    enabled: config.commands.unblacklist.enabled,
    data: new SlashCommandBuilder()
        .setName('unblacklist')
        .setDescription('Remove a user from the blacklist.')
        .addUserOption((option) => option.setName('user').setDescription('User').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits[config.commands.unblacklist.permission])
        .setDMPermission(false),
    async execute(interaction) {

        if (!interaction.member.roles.cache.some((role) => config.support_role_ids.includes(role.id))) {
            return interaction.reply({ content: config.errors.not_allowed, ephemeral: true });
          };

        let user = interaction.options.getUser("user");

        const notBlacklistedEmbed = new EmbedBuilder()
        .setColor(config.commands.unblacklist.embedFailed.color)
        .setDescription(`${config.commands.unblacklist.embedFailed.description}`.replace(/\{user\}/g, user).replace(/\{user\.tag\}/g, user.tag))

        const unblacklistedEmbed = new EmbedBuilder()
        .setColor(config.commands.unblacklist.embedSuccess.color)
        .setDescription(`${config.commands.unblacklist.embedSuccess.description}`.replace(/\{user\}/g, user).replace(/\{user\.tag\}/g, user.tag))

        const blacklistedUsers = await mainDB.get('blacklistedUsers');
        if (blacklistedUsers.includes(user.id)) {
            // User is blacklisted
            await mainDB.pull('blacklistedUsers', user.id);
            return interaction.reply({ embeds: [unblacklistedEmbed], ephemeral: true });
          }
          
          // User is not blacklisted
          return interaction.reply({ embeds: [notBlacklistedEmbed], ephemeral: true });

    }

}