const {
  EmbedBuilder,
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const fs = require("fs");
const yaml = require("yaml");
const configFile = fs.readFileSync("./config.yml", "utf8");
const config = yaml.parse(configFile);
const { ticketsDB, sanitizeInput, logMessage } = require("../../index.js");

module.exports = {
  enabled: config.commands.add.enabled,
  data: new SlashCommandBuilder()
    .setName("add")
    .setDescription("Add a user or role to a ticket channel.")
    .addUserOption((option) =>
      option.setName("user").setDescription("Select a user").setRequired(false),
    )
    .addRoleOption((option) =>
      option.setName("role").setDescription("Select a role").setRequired(false),
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits[config.commands.add.permission],
    )
    .setDMPermission(false),
  async execute(interaction) {
    if (!(await ticketsDB.has(interaction.channel.id))) {
      return interaction.reply({
        content: config.errors.not_in_a_ticket,
        ephemeral: true,
      });
    }

    if (
      !interaction.member.roles.cache.some((role) =>
        config.support_role_ids.includes(role.id),
      )
    ) {
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
      // Check that the user is already in the ticket channel
      if (interaction.channel.members.has(user.id)) {
        return interaction.reply({
          content: "That user is already in this ticket.",
          ephemeral: true,
        });
      }

      interaction.channel.permissionOverwrites.create(user, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        AttachFiles: true,
        EmbedLinks: true,
      });

      const logEmbed = new EmbedBuilder()
        .setColor(config.commands.add.LogEmbed.color)
        .setTitle(config.commands.add.LogEmbed.title)
        .addFields([
          {
            name: config.commands.add.LogEmbed.field_staff,
            value: `> ${interaction.user}\n> ${sanitizeInput(interaction.user.tag)}`,
          },
          {
            name: config.commands.add.LogEmbed.field_target,
            value: `> ${user}\n> ${sanitizeInput(user.tag)}`,
          },
          {
            name: config.commands.add.LogEmbed.field_ticket,
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
        .setColor(config.commands.add.embed.color)
        .setDescription(
          `${config.commands.add.embed.description}`
            .replace(/\{target\}/g, user)
            .replace(/\{target\.tag\}/g, sanitizeInput(user.tag)),
        );
      interaction.reply({ embeds: [embed] });
      logsChannel.send({ embeds: [logEmbed] });
      logMessage(
        `${interaction.user.tag} added ${user.tag} to the ticket #${interaction.channel.name}`,
      );
    }

    if (role) {
      // Check that the role is already in the ticket channel
      if (interaction.channel.permissionsFor(role.id).has("ViewChannel")) {
        return interaction.reply({
          content: "That role is already in this ticket.",
          ephemeral: true,
        });
      }

      interaction.channel.permissionOverwrites.create(role, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        AttachFiles: true,
        EmbedLinks: true,
      });

      const logEmbed = new EmbedBuilder()
        .setColor(config.commands.add.LogEmbed.color)
        .setTitle(config.commands.add.LogEmbed.title)
        .addFields([
          {
            name: config.commands.add.LogEmbed.field_staff,
            value: `> ${interaction.user}\n> ${sanitizeInput(interaction.user.tag)}`,
          },
          {
            name: config.commands.add.LogEmbed.field_target,
            value: `> ${role}\n> ${sanitizeInput(role.name)}`,
          },
          {
            name: config.commands.add.LogEmbed.field_ticket,
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
        .setColor(config.commands.add.embed.color)
        .setDescription(
          `${config.commands.add.embed.description}`
            .replace(/\{target\}/g, role)
            .replace(/\{target\.tag\}/g, sanitizeInput(role.name)),
        );
      interaction.reply({ embeds: [embed] });
      logsChannel.send({ embeds: [logEmbed] });
      logMessage(
        `${interaction.user.tag} added ${role.name} to the ticket #${interaction.channel.name}`,
      );
    }
  },
};
