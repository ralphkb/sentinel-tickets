const { EmbedBuilder, SlashCommandBuilder, PermissionFlagsBits } = require ("discord.js");
const fs = require('fs');
const yaml = require('yaml');
const configFile = fs.readFileSync('./config.yml', 'utf8');
const config = yaml.parse(configFile);
const { mainDB, sanitizeInput } = require('../../index.js');

module.exports = {
    enabled: config.commands.unblacklist.enabled,
    data: new SlashCommandBuilder()
        .setName('unblacklist')
        .setDescription('Remove a user from the blacklist.')
        .addUserOption((option) => option.setName('user').setDescription('Select a user').setRequired(false))
        .addRoleOption((option) => option.setName('role').setDescription('Select a role').setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits[config.commands.unblacklist.permission])
        .setDMPermission(false),
    async execute(interaction) {

        if (!interaction.member.roles.cache.some((role) => config.support_role_ids.includes(role.id))) {
            return interaction.reply({ content: config.errors.not_allowed, ephemeral: true });
          };

        let user = interaction.options.getUser("user");
        let role = interaction.options.getRole("role");

        if ((!user && !role) || (user && role)) {
            return interaction.reply({ content: 'Please provide either a user or a role, but not both.', ephemeral: true });
        }

        const blacklistedUsers = await mainDB.get('blacklistedUsers');

        if (user) {
        const notBlacklistedEmbedUser = new EmbedBuilder()
        .setColor(config.commands.unblacklist.embedFailed.color)
        .setDescription(`${config.commands.unblacklist.embedFailed.description}`.replace(/\{target\}/g, user).replace(/\{target\.tag\}/g, sanitizeInput(user.tag)))

        const unblacklistedEmbedUser = new EmbedBuilder()
        .setColor(config.commands.unblacklist.embedSuccess.color)
        .setDescription(`${config.commands.unblacklist.embedSuccess.description}`.replace(/\{target\}/g, user).replace(/\{target\.tag\}/g, sanitizeInput(user.tag)))

        if (blacklistedUsers.includes(user.id)) {
            // User is blacklisted
            await mainDB.pull('blacklistedUsers', user.id);
            return interaction.reply({ embeds: [unblacklistedEmbedUser], ephemeral: true });
          }
          
          // User is not blacklisted
          return interaction.reply({ embeds: [notBlacklistedEmbedUser], ephemeral: true });
        }

        if (role) {
            const notBlacklistedEmbedRole = new EmbedBuilder()
            .setColor(config.commands.unblacklist.embedFailed.color)
            .setDescription(`${config.commands.unblacklist.embedFailed.description}`.replace(/\{target\}/g, role).replace(/\{target\.tag\}/g, sanitizeInput(role.name)))
    
            const unblacklistedEmbedRole = new EmbedBuilder()
            .setColor(config.commands.unblacklist.embedSuccess.color)
            .setDescription(`${config.commands.unblacklist.embedSuccess.description}`.replace(/\{target\}/g, role).replace(/\{target\.tag\}/g, sanitizeInput(role.name)))
    
            if (blacklistedUsers.includes(role.id)) {
                // User is blacklisted
                await mainDB.pull('blacklistedUsers', role.id);
                return interaction.reply({ embeds: [unblacklistedEmbedRole], ephemeral: true });
              }
              
              // User is not blacklisted
              return interaction.reply({ embeds: [notBlacklistedEmbedRole], ephemeral: true });
            }

    }

}