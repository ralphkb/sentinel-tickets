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
  client,
  ticketsDB,
  mainDB,
  ticketCategories,
  sanitizeInput,
  logMessage,
  checkSupportRole,
} = require("../../index.js");

module.exports = {
  enabled: config.commands.reopen.enabled,
  data: new SlashCommandBuilder()
    .setName("reopen")
    .setDescription("Re-Open a closed ticket.")
    .setDefaultMemberPermissions(
      PermissionFlagsBits[config.commands.reopen.permission],
    )
    .setDMPermission(false),
  async execute(interaction) {
    if (!(await ticketsDB.has(interaction.channel.id))) {
      return interaction.reply({
        content: config.errors.not_in_a_ticket,
        ephemeral: true,
      });
    }

    if ((await ticketsDB.get(`${interaction.channel.id}.status`)) === "Open") {
      return interaction.reply({
        content: "This ticket is already open!",
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

    let ticketUserID = client.users.cache.get(
      await ticketsDB.get(`${interaction.channel.id}.userID`),
    );
    let ticketChannel = interaction.guild.channels.cache.get(
      interaction.channel.id,
    );
    let ticketButton = await ticketsDB.get(`${interaction.channel.id}.button`);

    const logEmbed = new EmbedBuilder()
      .setColor(config.commands.reopen.LogEmbed.color)
      .setTitle(config.commands.reopen.LogEmbed.title)
      .addFields([
        {
          name: config.commands.reopen.LogEmbed.field_staff,
          value: `> <@!${interaction.user.id}>\n> ${sanitizeInput(interaction.user.tag)}`,
        },
        {
          name: config.commands.reopen.LogEmbed.field_user,
          value: `> <@!${ticketUserID.id}>\n> ${sanitizeInput(ticketUserID.tag)}`,
        },
        {
          name: config.commands.reopen.LogEmbed.field_ticket,
          value: `> #${sanitizeInput(interaction.channel.name)}\n> ${await ticketsDB.get(`${interaction.channel.id}.ticketType`)}`,
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

    let logsChannel = interaction.guild.channels.cache.get(
      config.logs_channel_id,
    );
    await logsChannel.send({ embeds: [logEmbed] });

    const embed = new EmbedBuilder()
      .setColor(config.commands.reopen.embed.color)
      .setDescription(
        `${config.commands.reopen.embed.description}`
          .replace(/\{user\}/g, `${interaction.user}`)
          .replace(/\{user\.tag\}/g, sanitizeInput(interaction.user.tag)),
      );

    Object.keys(ticketCategories).forEach(async (id) => {
      if (ticketButton === id) {
        const category = ticketCategories[id];

        if (
          category.closedCategoryID &&
          ticketChannel.parentId !== category.categoryID
        ) {
          await ticketChannel.setParent(category.categoryID, {
            lockPermissions: false,
          });
        }

        category.support_role_ids.forEach(async (roleId) => {
          await interaction.channel.permissionOverwrites.create(roleId, {
            ViewChannel: true,
            SendMessages: true,
            AttachFiles: true,
            EmbedLinks: true,
            ReadMessageHistory: true,
          });
        });
      }
    });

    let claimUser = client.users.cache.get(
      await ticketsDB.get(`${interaction.channel.id}.claimUser`),
    );
    await interaction.channel.permissionOverwrites.create(ticketUserID.id, {
      ViewChannel: true,
      SendMessages: true,
      AttachFiles: true,
      EmbedLinks: true,
      ReadMessageHistory: true,
    });
    if (claimUser)
      await interaction.channel.permissionOverwrites.create(claimUser.id, {
        ViewChannel: true,
        SendMessages: true,
        AttachFiles: true,
        EmbedLinks: true,
        ReadMessageHistory: true,
      });

    await interaction.channel.messages
      .fetch(await ticketsDB.get(`${interaction.channel.id}.closeMsgID`))
      .then((msg) => msg.delete());
    await ticketsDB.set(`${interaction.channel.id}.status`, "Open");
    await mainDB.push("openTickets", interaction.channel.id);
    await interaction.reply({ embeds: [embed] });
    logMessage(
      `${interaction.user.tag} re-opened the ticket #${interaction.channel.name} which was created by ${ticketUserID.tag}`,
    );
  },
};
