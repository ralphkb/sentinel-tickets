const { EmbedBuilder, SlashCommandBuilder, PermissionFlagsBits, ButtonBuilder, ButtonStyle, ActionRowBuilder} = require ("discord.js");
const fs = require('fs');
const yaml = require('yaml');
const configFile = fs.readFileSync('./config.yml', 'utf8');
const config = yaml.parse(configFile);
const { client, ticketsDB, mainDB, ticketCategories, sanitizeInput, logMessage } = require('../../index.js');

module.exports = {
    enabled: config.commands.close.enabled,
    data: new SlashCommandBuilder()
        .setName('close')
        .setDescription("Close a ticket.")
        .setDefaultMemberPermissions(PermissionFlagsBits[config.commands.close.permission])
        .setDMPermission(false),
    async execute(interaction) {

        if (!(await ticketsDB.has(interaction.channel.id))) {
            return interaction.reply({ content: config.errors.not_in_a_ticket, ephemeral: true });
          }

        if (!interaction.member.roles.cache.some((role) => config.support_role_ids.includes(role.id))) {
            return interaction.reply({ content: config.errors.not_allowed, ephemeral: true });
          };

        let ticketButton = await ticketsDB.get(`${interaction.channel.id}.button`);
        let ticketUserID = client.users.cache.get(await ticketsDB.get(`${interaction.channel.id}.userID`));
        let claimUser = client.users.cache.get(await ticketsDB.get(`${interaction.channel.id}.claimUser`));
        let ticketType = await ticketsDB.get(`${interaction.channel.id}.ticketType`);

        const logEmbed = new EmbedBuilder()
        .setColor(config.commands.close.LogEmbed.color)
        .setTitle(config.commands.close.LogEmbed.title)
        .addFields([
            { name: config.commands.close.LogEmbed.field_staff, value: `> <@!${interaction.user.id}>\n> ${sanitizeInput(interaction.user.tag)}` },
            { name: config.commands.close.LogEmbed.field_user, value: `> <@!${ticketUserID.id}>\n> ${sanitizeInput(ticketUserID.tag)}` },
            { name: config.commands.close.LogEmbed.field_ticket, value: `> #${sanitizeInput(interaction.channel.name)}\n> ${ticketType}` },
         ])
        .setTimestamp()
        .setThumbnail(interaction.user.displayAvatarURL({ format: 'png', dynamic: true, size: 1024 }))
        .setFooter({ text: `${interaction.user.tag}`, iconURL: `${interaction.user.displayAvatarURL({ format: 'png', dynamic: true, size: 1024 })}` })

        if (claimUser) logEmbed.addFields({ name: '• Claimed By', value: `> <@!${claimUser.id}>\n> ${sanitizeInput(claimUser.tag)}` })

        let logsChannel = interaction.guild.channels.cache.get(config.logs_channel_id);
        await logsChannel.send({ embeds: [logEmbed]});
        logMessage(`${interaction.user.tag} closed the ticket #${interaction.channel.name} which was created by ${ticketUserID.tag}`);

        const reOpenButton = new ButtonBuilder()
        .setCustomId('reOpen')
        .setLabel(config.reOpenButton.label)
        .setEmoji(config.reOpenButton.emoji)
        .setStyle(ButtonStyle[config.reOpenButton.style])

        const transcriptButton = new ButtonBuilder()
        .setCustomId('createTranscript')
        .setLabel(config.transcriptButton.label)
        .setEmoji(config.transcriptButton.emoji)
        .setStyle(ButtonStyle[config.transcriptButton.style])
    
        const deleteButton = new ButtonBuilder()
        .setCustomId('deleteTicket')
        .setLabel(config.deleteButton.label)
        .setEmoji(config.deleteButton.emoji)
        .setStyle(ButtonStyle[config.deleteButton.style])

        let row = new ActionRowBuilder().addComponents(reOpenButton, transcriptButton, deleteButton);

        const embed = new EmbedBuilder()
        .setColor(config.commands.close.embed.color)
        .setTitle(config.commands.close.embed.title)
        .setDescription(`${config.commands.close.embed.description}`.replace(/\{user\}/g, `${interaction.user}`).replace(/\{user\.tag\}/g, sanitizeInput(interaction.user.tag)))
        .setFooter({ text: `${interaction.user.tag}`, iconURL: `${interaction.user.displayAvatarURL({ dynamic: true })}` })
        .setTimestamp()

        await interaction.channel.members.forEach(member => {
            if (member.id !== client.user.id) {
              interaction.channel.permissionOverwrites.edit(member, {
                'SendMessages': false,
                'ViewChannel': true
              }).catch(console.error);
            }
          });
          
      let messageID;    
      await interaction.reply({ embeds: [embed], components: [row], fetchReply: true }).then(async function(message) { messageID = message.id });
      await ticketsDB.set(`${interaction.channel.id}.closeMsgID`, messageID);
      await ticketsDB.set(`${interaction.channel.id}.status`, "Closed");
      await mainDB.pull('openTickets', interaction.channel.id);

      Object.keys(ticketCategories).forEach(async (id) => {
        if (ticketButton === id) {
          const category = ticketCategories[id];
          await interaction.channel.setParent(category.closedCategoryID, { lockPermissions: false });
      
          config.support_role_ids.forEach(async (roleId) => {
            await interaction.channel.permissionOverwrites.edit(roleId, {
              'SendMessages': false,
              'ViewChannel': true
            }).catch((error) => {
              console.error(`Error updating permissions of support roles:`, error);
            });
          });
        }
      });

    }

}