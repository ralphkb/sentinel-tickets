const {
  SlashCommandBuilder,
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
const { ticketCategories, mainDB } = require("../../init.js");
const { configEmbed, logMessage } = require("../../utils/mainUtils.js");

module.exports = {
  enabled: config.commands.panel.enabled,
  data: new SlashCommandBuilder()
    .setName("panel")
    .setDescription("Send the ticket panel in the channel.")
    .setDefaultMemberPermissions(
      PermissionFlagsBits[config.commands.panel.permission],
    )
    .addIntegerOption((option) =>
      option
        .setName("id")
        .setDescription("The id of the panel")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("layout")
        .setDescription("Buttons or select menu for the panel layout")
        .setRequired(false)
        .addChoices(
          { name: "Buttons", value: "Buttons" },
          { name: "Menu", value: "Menu" },
        ),
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

    const panels = [];

    for (const panel of config.panels) {
      const { id, categories, maxButtonsPerRow, menuPlaceholder, panelEmbed } =
        panel;

      panels.push({
        id,
        categories,
        maxButtonsPerRow,
        menuPlaceholder,
        panelEmbed,
      });
    }

    const panelId = interaction.options.getInteger("id");
    const layout = interaction.options.getString("layout") || "Buttons";

    if (!panels.some((panel) => panel.id === panelId)) {
      return interaction.reply({
        content: "A panel with this ID does not exist.",
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    const defaultValues = {
      color: "#2FF200",
      title: "Support Tickets",
      description:
        "To create a support ticket, click on one of the options below depending on what help you need.",
      timestamp: true,
      footer: {
        text: "Sentinel Tickets",
      },
    };

    const panelIndex = config.panels.findIndex((panel) => panel.id === panelId);
    const panelEmbed = await configEmbed(
      ["panelEmbed", panelIndex],
      defaultValues,
    );
    const foundPanel = panels.find((p) => p.id === panelId);
    const customIds = foundPanel.categories.flatMap((str) => str.split(", "));

    if (layout === "Buttons") {
      // Creating the buttons, action rows and more
      const buttons = [];

      // Iterate over the configured custom IDs
      for (const customId of customIds) {
        const category = ticketCategories[customId];
        // Create a button for each configured category using the properties from `ticketCategories`
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
      const maxButtonsPerRow = foundPanel.maxButtonsPerRow || 5;

      // Divide the buttons into groups of maxButtonsPerRow and create a new action row for each group
      for (let i = 0; i < buttons.length; i += maxButtonsPerRow) {
        const buttonsGroup = buttons.slice(i, i + maxButtonsPerRow);
        const actionRow = new ActionRowBuilder().addComponents(...buttonsGroup);
        actionRows.push(actionRow);
      }

      // Send an initial response to acknowledge receipt of the command
      await interaction.editReply({
        content: `Sending the panel with id ${panelId} in this channel...`,
        ephemeral: true,
      });
      // Send the panel embed and action rows
      await interaction.channel.send({
        embeds: [panelEmbed],
        components: actionRows,
      });
      logMessage(
        `${interaction.user.tag} sent the ticket panel with id ${panelId} in the channel #${interaction.channel.name}`,
      );
    } else if (layout === "Menu") {
      // Create an array to hold select menu options
      const options = [];

      // Iterate over the configured custom IDs
      for (const customId of customIds) {
        const category = ticketCategories[customId];
        // Create an option for each configured category using the properties from `ticketCategories`
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
          foundPanel.menuPlaceholder || "Select a category to open a ticket.",
        )
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(options);

      // Create an action row to store the select menu
      const actionRowsMenus = new ActionRowBuilder().addComponents(selectMenu);

      // Send an initial response to acknowledge receipt of the command
      await interaction.editReply({
        content: `Sending the panel with id ${panelId} in this channel...`,
        ephemeral: true,
      });
      // Send the panel embed and action row
      await interaction.channel
        .send({ embeds: [panelEmbed], components: [actionRowsMenus] })
        .then(async function (message) {
          await mainDB.set(`selectMenuOptions-${message.id}`, {
            options,
            placeholder:
              foundPanel.menuPlaceholder ||
              "Select a category to open a ticket.",
          });
        });
      logMessage(
        `${interaction.user.tag} sent the ticket panel with id ${panelId} in the channel #${interaction.channel.name}`,
      );
    }
  },
};
