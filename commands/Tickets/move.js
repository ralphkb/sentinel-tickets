const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const fs = require("fs");
const yaml = require("yaml");
const configFile = fs.readFileSync("./config.yml", "utf8");
const config = yaml.parse(configFile);
const { client, ticketsDB, ticketCategories } = require("../../init.js");
const {
  sanitizeInput,
  logMessage,
  checkSupportRole,
  configEmbed,
  getUser,
  findAvailableCategory,
  getChannel,
} = require("../../utils/mainUtils.js");

module.exports = {
  enabled: config.commands.move.enabled,
  data: new SlashCommandBuilder()
    .setName("move")
    .setDescription("Move a ticket channel from one category to another.")
    .addStringOption((option) =>
      option
        .setName("category")
        .setDescription("Input a Category Name")
        .setRequired(true),
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits[config.commands.move.permission],
    )
    .setDMPermission(false),
  async execute(interaction) {
    if (!(await ticketsDB.has(interaction.channel.id))) {
      return interaction.reply({
        content:
          config.errors.not_in_a_ticket || "You are not in a ticket channel!",
        ephemeral: true,
      });
    }

    const hasSupportRole = await checkSupportRole(interaction);
    if (!hasSupportRole) {
      return interaction.reply({
        content:
          config.errors.not_allowed || "You are not allowed to use this!",
        ephemeral: true,
      });
    }

    let option = interaction.options.getString("category").toLowerCase();
    let ticketType = await ticketsDB.get(
      `${interaction.channel.id}.ticketType`,
    );
    const customIds = Object.keys(ticketCategories);
    const choices = customIds.map((customId) => {
      const category = ticketCategories[customId];
      return category.name;
    });

    if (!choices.includes(option)) {
      return interaction.reply({
        content: `Invalid option. Available options are: ${choices.join(", ")}`,
        ephemeral: true,
      });
    }

    if (option === ticketType) {
      return interaction.reply({
        content: "This ticket is already in that category.",
        ephemeral: true,
      });
    }

    const isEphemeral =
      config.moveEmbed.ephemeral !== undefined
        ? config.moveEmbed.ephemeral
        : false;
    await interaction.deferReply({ ephemeral: isEphemeral });

    // Find the categoryID based on the name
    const category = Object.values(ticketCategories).find(
      (category) => category.name === option,
    );
    const categoryIDs = category.categoryID;
    const categoryID = await findAvailableCategory(categoryIDs);
    if (config.commands.move.updateTopic) {
      const ticketTopic = category.ticketTopic;
      const ticketCreator = await getUser(
        await ticketsDB.get(`${interaction.channel.id}.userID`),
      );
      await interaction.channel.setTopic(
        ticketTopic
          .replace(/\{user\}/g, ticketCreator.tag)
          .replace(/\{type\}/g, category.name),
      );
    }
    await ticketsDB.set(`${interaction.channel.id}.ticketType`, option);
    await interaction.channel.setParent(categoryID, { lockPermissions: false });

    let logChannelId = config.logs.ticketMove || config.logs.default;
    let logChannel = await getChannel(logChannelId);

    const logDefaultValues = {
      color: "2FF200",
      title: "Ticket Logs | Ticket Moved",
      timestamp: true,
      thumbnail: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
      footer: {
        text: `${interaction.user.tag}`,
        iconURL: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
      },
    };

    const logMoveEmbed = await configEmbed("logMoveEmbed", logDefaultValues);

    logMoveEmbed.addFields([
      {
        name: config.logMoveEmbed.field_staff,
        value: `> ${interaction.user}\n> ${sanitizeInput(interaction.user.tag)}`,
      },
      {
        name: config.logMoveEmbed.field_ticket,
        value: `> ${interaction.channel}\n> #${sanitizeInput(interaction.channel.name)}`,
      },
      {
        name: config.logMoveEmbed.field_category,
        value: `> ${ticketType} -> ${option}`,
      },
    ]);

    if (config.toggleLogs.ticketMove) {
      try {
        await logChannel.send({ embeds: [logMoveEmbed] });
      } catch (error) {
        error.errorContext = `[Logging Error]: please make sure to at least configure your default log channel`;
        client.emit("error", error);
      }
    }

    const defaultValues = {
      color: "#2FF200",
      description: "Moved this ticket to the **{category}** category.",
    };

    const moveEmbed = await configEmbed("moveEmbed", defaultValues);

    if (moveEmbed.data && moveEmbed.data.description) {
      moveEmbed.setDescription(
        moveEmbed.data.description.replace(/\{category\}/g, option),
      );
    }

    await interaction.editReply({
      embeds: [moveEmbed],
      ephemeral: isEphemeral,
    });
    logMessage(
      `${interaction.user.tag} moved the ticket #${interaction.channel.name} to the category ${option}.`,
    );
  },
};
