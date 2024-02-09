const {
  EmbedBuilder,
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const fs = require("fs");
const yaml = require("yaml");
const configFile = fs.readFileSync("./config.yml", "utf8");
const config = yaml.parse(configFile);
const {
  ticketsDB,
  sanitizeInput,
  logMessage,
  checkSupportRole,
} = require("../../index.js");

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
    .setDefaultMemberPermissions(
      PermissionFlagsBits[config.commands.remove.permission],
    )
    .setDMPermission(false),
  async execute(interaction) {
    if (!(await ticketsDB.has(interaction.channel.id))) {
      return interaction.reply({
        content: config.errors.not_in_a_ticket,
        ephemeral: true,
      });
    }

    const hasSupportRole = await checkSupportRole(interaction);
    if (!hasSupportRole) {
      return interaction.reply({
        content: config.errors.not_allowed,
        ephemeral: true,
      });
    }

    let user = interaction.options.getUser("user");
    let role = interaction.options.getRole("role");
    let logsChannel = interaction.guild.channels.cache.get(
      config.logs_channel_id,
    );

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

      interaction.channel.permissionOverwrites.delete(user);

      const logEmbed = new EmbedBuilder()
        .setColor(config.commands.remove.LogEmbed.color)
        .setTitle(config.commands.remove.LogEmbed.title)
        .addFields([
          {
            name: config.commands.remove.LogEmbed.field_staff,
            value: `> ${interaction.user}\n> ${sanitizeInput(interaction.user.tag)}`,
          },
          {
            name: config.commands.remove.LogEmbed.field_target,
            value: `> ${user}\n> ${sanitizeInput(user.tag)}`,
          },
          {
            name: config.commands.remove.LogEmbed.field_ticket,
            value: `> ${interaction.channel}\n> #${sanitizeInput(interaction.channel.name)}`,
          },
        ])
        .setTimestamp()
        .setThumbnail(
          interaction.user.displayAvatarURL({
            format: "png",
            dynamic: true,
            size: 1024,
          }),
        )
        .setFooter({
          text: `${interaction.user.tag}`,
          iconURL: `${interaction.user.displayAvatarURL({ format: "png", dynamic: true, size: 1024 })}`,
        });

      const embed = new EmbedBuilder()
        .setColor(config.commands.remove.embed.color)
        .setDescription(
          `${config.commands.remove.embed.description}`
            .replace(/\{target\}/g, user)
            .replace(/\{target\.tag\}/g, sanitizeInput(user.tag)),
        );

      interaction.reply({ embeds: [embed] });
      logsChannel.send({ embeds: [logEmbed] });
      logMessage(
        `${interaction.user.tag} removed ${user.tag} from the ticket #${interaction.channel.name}`,
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

      interaction.channel.permissionOverwrites.delete(role);

      const logEmbed = new EmbedBuilder()
        .setColor(config.commands.remove.LogEmbed.color)
        .setTitle(config.commands.remove.LogEmbed.title)
        .addFields([
          {
            name: config.commands.remove.LogEmbed.field_staff,
            value: `> ${interaction.user}\n> ${sanitizeInput(interaction.user.tag)}`,
          },
          {
            name: config.commands.remove.LogEmbed.field_target,
            value: `> ${role}\n> ${sanitizeInput(role.name)}`,
          },
          {
            name: config.commands.remove.LogEmbed.field_ticket,
            value: `> ${interaction.channel}\n> #${sanitizeInput(interaction.channel.name)}`,
          },
        ])
        .setTimestamp()
        .setThumbnail(
          interaction.user.displayAvatarURL({
            format: "png",
            dynamic: true,
            size: 1024,
          }),
        )
        .setFooter({
          text: `${interaction.user.tag}`,
          iconURL: `${interaction.user.displayAvatarURL({ format: "png", dynamic: true, size: 1024 })}`,
        });

      const embed = new EmbedBuilder()
        .setColor(config.commands.remove.embed.color)
        .setDescription(
          `${config.commands.remove.embed.description}`
            .replace(/\{target\}/g, role)
            .replace(/\{target\.tag\}/g, sanitizeInput(role.name)),
        );

      interaction.reply({ embeds: [embed] });
      logsChannel.send({ embeds: [logEmbed] });
      logMessage(
        `${interaction.user.tag} removed ${role.name} from the ticket #${interaction.channel.name}`,
      );
    }
  },
};
