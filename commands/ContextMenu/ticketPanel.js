const {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} = require("discord.js");
const fs = require("fs");
const yaml = require("yaml");
const configFile = fs.readFileSync("./config.yml", "utf8");
const config = yaml.parse(configFile);
const {
  ticketCategories,
  logMessage,
  mainDB,
  configEmbed,
} = require("../../index.js");

module.exports = {
  enabled: config.contextMenuCommands.ticketPanel.enabled,
  data: new ContextMenuCommandBuilder()
    .setName("Ticket Panel")
    .setType(ApplicationCommandType.Message)
    .setDefaultMemberPermissions(
      PermissionFlagsBits[config.contextMenuCommands.ticketPanel.permission],
    )
    .setDMPermission(false),
  async execute(interaction) {
    if (
      config.commands.panel.support_role_ids.length > 0 &&
      !interaction.member.roles.cache.some((role) =>
        config.commands.panel.support_role_ids.includes(role.id),
      )
    ) {
      return interaction.reply({
        content:
          config.errors.not_allowed || "You are not allowed to use this!",
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    const defaultValues = {
      color: "#2FF200",
      title: "Support Tickets",
      description:
        "To create a support ticket, click on one of the buttons below depending on what help you need.",
      timestamp: true,
      footer: {
        text: "Sentinel Tickets",
      },
    };

    const panelEmbed = await configEmbed("panelEmbed", defaultValues);
    const panelMethod = config.panelMethod || "Buttons";

    if (panelMethod === "Buttons") {
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
          .setStyle(ButtonStyle[category.buttonStyle]);

        if (category.buttonEmoji !== "") {
          button.setEmoji(category.buttonEmoji);
        }

        // Add the button to the array
        buttons.push(button);
      }

      // Create an array to store the action rows
      const actionRows = [];
      const maxButtonsPerRow = config.maxButtonsPerRow || 5;

      // Divide the buttons into groups of maxButtonsPerRow and create a new action row for each group
      for (let i = 0; i < buttons.length; i += maxButtonsPerRow) {
        const buttonsGroup = buttons.slice(i, i + maxButtonsPerRow);
        const actionRow = new ActionRowBuilder().addComponents(...buttonsGroup);
        actionRows.push(actionRow);
      }

      // Send an initial response to acknowledge receipt of the command
      await interaction.editReply({
        content: "Sending the panel in this channel...",
        ephemeral: true,
      });
      // Send the panel embed and action rows
      await interaction.channel.send({
        embeds: [panelEmbed],
        components: actionRows,
      });
      logMessage(
        `${interaction.user.tag} sent the ticket panel in the channel #${interaction.channel.name}`,
      );
    } else if (panelMethod === "Menu") {
      // Create an array to hold select menu options
      const options = [];

      // Get the custom IDs from the `ticketCategories` object using `Object.keys()`
      const customIds = Object.keys(ticketCategories);

      // Iterate over the custom IDs
      for (const customId of customIds) {
        const category = ticketCategories[customId];
        // Create an option for each category using the properties from `ticketCategories`
        const option = new StringSelectMenuOptionBuilder()
          .setLabel(category.menuLabel)
          .setDescription(category.menuDescription)
          .setValue(customId);

        if (category.menuEmoji !== "") {
          option.setEmoji(category.menuEmoji);
        }

        // Add the option to the array
        options.push(option);
      }

      // Creating the select menu with the options
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("categoryMenu")
        .setPlaceholder(
          config.menuPlaceholder || "Select a category to open a ticket.",
        )
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(options);

      // Create an action row to store the select menu
      const actionRowsMenus = new ActionRowBuilder().addComponents(selectMenu);

      // Send an initial response to acknowledge receipt of the command
      await interaction.editReply({
        content: "Sending the panel in this channel...",
        ephemeral: true,
      });
      // Send the panel embed and action row
      await interaction.channel
        .send({ embeds: [panelEmbed], components: [actionRowsMenus] })
        .then(async function () {
          await mainDB.set(`selectMenuOptions`, options);
        });
      logMessage(
        `${interaction.user.tag} sent the ticket panel in the channel #${interaction.channel.name}`,
      );
    }
  },
};
