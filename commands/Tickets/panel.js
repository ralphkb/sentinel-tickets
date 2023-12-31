const { EmbedBuilder, SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const yaml = require('yaml');
const configFile = fs.readFileSync('./config.yml', 'utf8');
const config = yaml.parse(configFile);
const { ticketCategories } = require('../../index.js');

module.exports = {
	enabled: config.commands.panel.enabled,
    data: new SlashCommandBuilder()
        .setName('panel')
        .setDescription('Send the ticket panel in the channel.')
		.setDefaultMemberPermissions(PermissionFlagsBits[config.commands.panel.permission])
        .setDMPermission(false),
    async execute(interaction) {

        if (!interaction.member.roles.cache.some((role) => config.support_role_ids.includes(role.id))) {
            return interaction.reply({ content: config.errors.not_allowed, ephemeral: true });
          };
		  
		  const panelEmbed = new EmbedBuilder()
		  .setColor(config.commands.panel.embed.color)
		  .setTitle(config.commands.panel.embed.title)
		  .setDescription(config.commands.panel.embed.description)
		  .setFooter({ text: config.commands.panel.embed.footer_msg, iconURL: config.commands.panel.embed.footer_icon_url })

		 // Creating the buttons, action rows and more
		 const buttons = [];

		 // Get the custom IDs from the `ticketCategories` object using `Object.keys()`
         const customIds = Object.keys(ticketCategories);

		 // Iterate over the custom IDs
		 for (const customId of customIds) {
			const category = ticketCategories[customId];
			// Create a button for each category using the properties from `ticketCategories`
			const button = new ButtonBuilder()
			.setCustomId(customId)
			.setLabel(category.buttonLabel)
			.setStyle(ButtonStyle[category.buttonStyle])
			.setEmoji(category.buttonEmoji);

			// Add the button to the array
            buttons.push(button);
		 }

		 // Create an array to store the action rows
		 const actionRows = [];

		 // Divide the buttons into groups of 5 and create a new action row for each group
		 for (let i = 0; i < buttons.length; i += 5) {
			const buttonsGroup = buttons.slice(i, i + 5);
			const actionRow = new ActionRowBuilder().addComponents(...buttonsGroup);
			actionRows.push(actionRow);
		  }

		 // Send an initial response to acknowledge receipt of the command
         await interaction.reply({ content: 'Sending the panel in this channel...', ephemeral: true });
		 // Send the panel embed and action rows
		 await interaction.channel.send({ embeds: [panelEmbed], components: actionRows });

	}
};
		