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

    await interaction.deferReply();
    let newName = interaction.options.getString("name");
    interaction.channel.setName(`${newName}`);
    let logChannelId = config.logs.ticketRename || config.logs.default;
    let logChannel = interaction.guild.channels.cache.get(logChannelId);

    const log = new EmbedBuilder()
      .setColor(config.commands.rename.LogEmbed.color)
      .setTitle(config.commands.rename.LogEmbed.title)
      .addFields([
        {
          name: config.commands.rename.LogEmbed.field_staff,
          value: `> ${interaction.user}\n> ${sanitizeInput(interaction.user.tag)}`,
        },
        {
          name: config.commands.rename.LogEmbed.field_oldname,
          value: `> #${sanitizeInput(interaction.channel.name)}`,
        },
        {
          name: config.commands.rename.LogEmbed.field_newname,
          value: `> ${interaction.channel}\n> #${sanitizeInput(newName)}`,
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
      .setColor(config.commands.rename.embed.color)
      .setDescription(
        `${config.commands.rename.embed.description}`.replace(
          /\{name\}/g,
          sanitizeInput(newName),
        ),
      );

    await interaction.editReply({ embeds: [embed] });
    await logChannel.send({ embeds: [log] });
    logMessage(
      `${interaction.user.tag} renamed the ticket #${interaction.channel.name} to #${newName}`,
    );
  },
};
