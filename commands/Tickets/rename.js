const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const fs = require("fs");
const yaml = require("yaml");
const configFile = fs.readFileSync("./config.yml", "utf8");
const config = yaml.parse(configFile);
const { client, ticketsDB } = require("../../init.js");
const {
  sanitizeInput,
  logMessage,
  checkSupportRole,
  configEmbed,
  getChannel,
} = require("../../utils/mainUtils.js");

module.exports = {
  enabled: config.commands.rename.enabled,
  data: new SlashCommandBuilder()
    .setName("rename")
    .setDescription("Rename a ticket.")
    .addStringOption((option) =>
      option.setName("name").setDescription("name").setRequired(true),
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits[config.commands.rename.permission],
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
    const isEphemeral =
      config.renameEmbed.ephemeral !== undefined
        ? config.renameEmbed.ephemeral
        : false;

    await interaction.deferReply({ ephemeral: isEphemeral });
    let newName = interaction.options.getString("name");
    interaction.channel.setName(`${newName}`);
    let logChannelId = config.logs.ticketRename || config.logs.default;
    let logChannel = await getChannel(logChannelId);

    const logDefaultValues = {
      color: "#2FF200",
      title: "Ticket Logs | Ticket Renamed",
      timestamp: true,
      thumbnail: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
      footer: {
        text: `${interaction.user.tag}`,
        iconURL: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
      },
    };

    const logRenameEmbed = await configEmbed(
      "logRenameEmbed",
      logDefaultValues,
    );

    logRenameEmbed.addFields([
      {
        name: config.logRenameEmbed.field_staff,
        value: `> ${interaction.user}\n> ${sanitizeInput(interaction.user.tag)}`,
      },
      {
        name: config.logRenameEmbed.field_oldname,
        value: `> #${sanitizeInput(interaction.channel.name)}`,
      },
      {
        name: config.logRenameEmbed.field_newname,
        value: `> ${interaction.channel}\n> #${sanitizeInput(newName)}`,
      },
    ]);

    const defaultValues = {
      color: "#2FF200",
      description: "This ticket has been renamed to **{name}**!",
    };

    const renameEmbed = await configEmbed("renameEmbed", defaultValues);

    if (renameEmbed.data && renameEmbed.data.description) {
      renameEmbed.setDescription(
        renameEmbed.data.description.replace(
          /\{name\}/g,
          sanitizeInput(newName),
        ),
      );
    }

    await interaction.editReply({
      embeds: [renameEmbed],
      ephemeral: isEphemeral,
    });
    if (config.toggleLogs.ticketRename) {
      try {
        await logChannel.send({ embeds: [logRenameEmbed] });
      } catch (error) {
        error.errorContext = `[Logging Error]: please make sure to at least configure your default log channel`;
        client.emit("error", error);
      }
    }
    logMessage(
      `${interaction.user.tag} renamed the ticket #${interaction.channel.name} to #${newName}`,
    );
  },
};
