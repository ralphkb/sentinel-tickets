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
  enabled: config.commands.remove.enabled,
  data: new SlashCommandBuilder()
    .setName("remove")
    .setDescription("Remove a user or role from a ticket channel.")
    .addUserOption((option) =>
      option.setName("user").setDescription("Select a user").setRequired(false),
    )
    .addRoleOption((option) =>
      option.setName("role").setDescription("Select a role").setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("The reason for removing the user or role")
        .setRequired(false),
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits[config.commands.remove.permission],
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

    let user = interaction.options.getUser("user");
    let role = interaction.options.getRole("role");
    let reason =
      interaction.options.getString("reason") || "No reason provided.";
    let logChannelId = config.logs.userRemove || config.logs.default;
    let logChannel = await getChannel(logChannelId);
    const isEphemeral =
      config.removeEmbed.ephemeral !== undefined
        ? config.removeEmbed.ephemeral
        : false;

    if ((!user && !role) || (user && role)) {
      return interaction.reply({
        content: "Please provide either a user or a role, but not both.",
        ephemeral: true,
      });
    }

    if (user) {
      // Check if the user is in the ticket channel
      if (!interaction.channel.members.has(user.id)) {
        return interaction.reply({
          content: "That user is not in this ticket.",
          ephemeral: true,
        });
      }

      const ticketCreatorID = await ticketsDB.get(
        `${interaction.channel.id}.userID`,
      );
      // Check if the user is the ticket creator
      if (user.id === ticketCreatorID) {
        return interaction.reply({
          content: "You cannot remove the ticket creator.",
          ephemeral: true,
        });
      }

      await interaction.deferReply({ ephemeral: isEphemeral });
      await interaction.channel.permissionOverwrites.delete(user);

      const logDefaultValues = {
        color: "#FF0000",
        title: "Ticket Logs | Target Removed",
        timestamp: true,
        thumbnail: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
        footer: {
          text: `${interaction.user.tag}`,
          iconURL: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
        },
      };

      const logUserRemoveEmbed = await configEmbed(
        "logRemoveEmbed",
        logDefaultValues,
      );

      logUserRemoveEmbed.addFields([
        {
          name: config.logRemoveEmbed.field_staff,
          value: `> ${interaction.user}\n> ${sanitizeInput(interaction.user.tag)}`,
        },
        {
          name: config.logRemoveEmbed.field_target,
          value: `> ${user}\n> ${sanitizeInput(user.tag)}`,
        },
        {
          name: config.logRemoveEmbed.field_ticket,
          value: `> ${interaction.channel}\n> #${sanitizeInput(interaction.channel.name)}`,
        },
        {
          name: config.logRemoveEmbed.field_reason,
          value: `> ${reason}`,
        },
      ]);

      const defaultValues = {
        color: "#FF0000",
        description:
          "Removed **{target} ({target.tag})** from the ticket.\nReason: **{reason}**",
      };

      const userRemoveEmbed = await configEmbed("removeEmbed", defaultValues);

      if (userRemoveEmbed.data && userRemoveEmbed.data.description) {
        userRemoveEmbed.setDescription(
          userRemoveEmbed.data.description
            .replace(/\{target\}/g, user)
            .replace(/\{target\.tag\}/g, sanitizeInput(user.tag))
            .replace(/\{reason\}/g, reason),
        );
      }

      await ticketsDB.pull(`${interaction.channel.id}.addedUsers`, user.id);
      await interaction.editReply({
        embeds: [userRemoveEmbed],
        ephemeral: isEphemeral,
      });
      if (config.toggleLogs.userRemove) {
        try {
          await logChannel.send({ embeds: [logUserRemoveEmbed] });
        } catch (error) {
          error.errorContext = `[Logging Error]: please make sure to at least configure your default log channel`;
          client.emit("error", error);
        }
      }
      logMessage(
        `${interaction.user.tag} removed ${user.tag} from the ticket #${interaction.channel.name} with reason ${reason}`,
      );
    }

    if (role) {
      // Check if the role is in the ticket channel
      if (!interaction.channel.permissionsFor(role.id).has("ViewChannel")) {
        return interaction.reply({
          content: "That role is not in this ticket.",
          ephemeral: true,
        });
      }

      await interaction.deferReply({ ephemeral: isEphemeral });
      await interaction.channel.permissionOverwrites.delete(role);

      const logDefaultValues = {
        color: "#FF0000",
        title: "Ticket Logs | Target Removed",
        timestamp: true,
        thumbnail: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
        footer: {
          text: `${interaction.user.tag}`,
          iconURL: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
        },
      };

      const logRoleRemoveEmbed = await configEmbed(
        "logRemoveEmbed",
        logDefaultValues,
      );

      logRoleRemoveEmbed.addFields([
        {
          name: config.logRemoveEmbed.field_staff,
          value: `> ${interaction.user}\n> ${sanitizeInput(interaction.user.tag)}`,
        },
        {
          name: config.logRemoveEmbed.field_target,
          value: `> ${role}\n> ${sanitizeInput(role.name)}`,
        },
        {
          name: config.logRemoveEmbed.field_ticket,
          value: `> ${interaction.channel}\n> #${sanitizeInput(interaction.channel.name)}`,
        },
        {
          name: config.logRemoveEmbed.field_reason,
          value: `> ${reason}`,
        },
      ]);

      const defaultValues = {
        color: "#FF0000",
        description:
          "Removed **{target} ({target.tag})** from the ticket.\nReason: **{reason}**",
      };

      const roleRemoveEmbed = await configEmbed("removeEmbed", defaultValues);

      if (roleRemoveEmbed.data && roleRemoveEmbed.data.description) {
        roleRemoveEmbed.setDescription(
          roleRemoveEmbed.data.description
            .replace(/\{target\}/g, role)
            .replace(/\{target\.tag\}/g, sanitizeInput(role.name))
            .replace(/\{reason\}/g, reason),
        );
      }

      await ticketsDB.pull(`${interaction.channel.id}.addedRoles`, role.id);
      await interaction.editReply({
        embeds: [roleRemoveEmbed],
        ephemeral: isEphemeral,
      });
      if (config.toggleLogs.userRemove) {
        try {
          await logChannel.send({ embeds: [logRoleRemoveEmbed] });
        } catch (error) {
          error.errorContext = `[Logging Error]: please make sure to at least configure your default log channel`;
          client.emit("error", error);
        }
      }
      logMessage(
        `${interaction.user.tag} removed ${role.name} from the ticket #${interaction.channel.name} with reason ${reason}`,
      );
    }
  },
};
