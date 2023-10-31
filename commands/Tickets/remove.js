const { EmbedBuilder, SlashCommandBuilder, PermissionFlagsBits } = require ("discord.js");
const fs = require('fs');
const yaml = require('yaml');
const configFile = fs.readFileSync('./config.yml', 'utf8');
const config = yaml.parse(configFile);
const { ticketsDB } = require('../../index.js');

module.exports = {
    enabled: config.commands.remove.enabled,
    data: new SlashCommandBuilder()
        .setName('remove')
        .setDescription('Remove a user from a ticket channel.')
        .addUserOption((option) => option.setName('user').setDescription('User').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits[config.commands.remove.permission])
        .setDMPermission(false),
    async execute(interaction) {

        if (!(await ticketsDB.has(interaction.channel.id))) {
            return interaction.reply({ content: config.errors.not_in_a_ticket, ephemeral: true });
          };

        if (!interaction.member.roles.cache.some((role) => config.support_role_ids.includes(role.id))) {
            return interaction.reply({ content: config.errors.not_allowed, ephemeral: true });
          };

        let user = interaction.options.getUser("user");
        interaction.channel.permissionOverwrites.delete(user);    
        let logsChannel = interaction.guild.channels.cache.get(config.logs_channel_id);
    
        const logEmbed = new EmbedBuilder()
        .setColor(config.commands.remove.LogEmbed.color)
        .setTitle(config.commands.remove.LogEmbed.title)
        .addFields([
            { name: config.commands.remove.LogEmbed.field_staff, value: `> ${interaction.user}\n> ${interaction.user.tag}` },
            { name: config.commands.remove.LogEmbed.field_user, value: `> ${user}\n> ${user.tag}` },
            { name: config.commands.remove.LogEmbed.field_ticket, value: `> ${interaction.channel}\n> #${interaction.channel.name}` },
         ])
        .setTimestamp()
        .setThumbnail(interaction.user.displayAvatarURL({ format: 'png', dynamic: true, size: 1024 }))
        .setFooter({ text: `${interaction.user.tag}`, iconURL: `${interaction.user.displayAvatarURL({ format: 'png', dynamic: true, size: 1024 })}` })

        const embed = new EmbedBuilder()
        .setColor(config.commands.remove.embed.color)
        .setDescription(`${config.commands.remove.embed.description}`.replace(/\{user\}/g, user).replace(/\{user\.tag\}/g, user.tag))
    
        interaction.reply({ embeds: [embed] });
        logsChannel.send({ embeds: [logEmbed] });

    }

}