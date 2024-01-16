const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { reloadAllSlashCommands } = require('../../index.js');

module.exports = {
    enabled: true,
    data: new SlashCommandBuilder()
        .setName('reload')
        .setDescription('Reload all the slash commands.')
        .setDefaultMemberPermissions(PermissionFlagsBits["ManageChannels"])
        .setDMPermission(false),
    async execute(interaction) {

        await reloadAllSlashCommands();
        await interaction.reply({ content: 'Reloaded all slash commands, use with caution due to rate limits. This command should only be used if you had issues loading slash commands changes due to bot updates.', ephemeral: true });

    }

}