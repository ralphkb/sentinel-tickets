const { EmbedBuilder, SlashCommandBuilder, PermissionFlagsBits } = require ("discord.js");
const fs = require('fs');
const yaml = require('yaml');
const configFile = fs.readFileSync('./config.yml', 'utf8');
const config = yaml.parse(configFile);
const { mainDB, sanitizeInput } = require('../../index.js');

module.exports = {
    enabled: config.commands.blacklist.enabled,
    data: new SlashCommandBuilder()
        .setName('blacklist')
        .setDescription('Add a user to the blacklist.')
        .addUserOption((option) => option.setName('user').setDescription('User').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits[config.commands.blacklist.permission])
        .setDMPermission(false),
    async execute(interaction) {

        if (!interaction.member.roles.cache.some((role) => config.support_role_ids.includes(role.id))) {
            return interaction.reply({ content: config.errors.not_allowed, ephemeral: true });
          };

        let user = interaction.options.getUser("user");

        const alreadyBlacklistedEmbed = new EmbedBuilder()
        .setColor(config.commands.blacklist.embedFailed.color)
        .setDescription(`${config.commands.blacklist.embedFailed.description}`.replace(/\{user\}/g, user).replace(/\{user\.tag\}/g, sanitizeInput(user.tag)))

        const blacklistedEmbed = new EmbedBuilder()
        .setColor(config.commands.blacklist.embedSuccess.color)
        .setDescription(`${config.commands.blacklist.embedSuccess.description}`.replace(/\{user\}/g, user).replace(/\{user\.tag\}/g, sanitizeInput(user.tag)))

        const blacklistedUsers = await mainDB.get('blacklistedUsers');
        if (blacklistedUsers.includes(user.id)) {
            // User is already blacklisted
            return interaction.reply({ embeds: [alreadyBlacklistedEmbed], ephemeral: true });
        }
        
        // User is not blacklisted
        await mainDB.push('blacklistedUsers', user.id);
        interaction.reply({ embeds: [blacklistedEmbed], ephemeral: true });

    }

}