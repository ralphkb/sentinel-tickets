const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
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
  configEmbed,
} = require("../../index.js");

module.exports = {
  enabled: config.commands.close.enabled,
  data: new SlashCommandBuilder()
    .setName("close")
    .setDescription("Close a ticket.")
    .setDefaultMemberPermissions(
      PermissionFlagsBits[config.commands.close.permission],
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

    if (
      (await ticketsDB.get(`${interaction.channel.id}.status`)) === "Closed"
    ) {
      return interaction.reply({
        content: "This ticket is already closed!",
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

    await interaction.deferReply();
    let ticketButton = await ticketsDB.get(`${interaction.channel.id}.button`);
    let ticketUserID = client.users.cache.get(
      await ticketsDB.get(`${interaction.channel.id}.userID`),
    );
    let claimUser = client.users.cache.get(
      await ticketsDB.get(`${interaction.channel.id}.claimUser`),
    );
    let ticketType = await ticketsDB.get(
      `${interaction.channel.id}.ticketType`,
    );

    const logDefaultValues = {
      color: "#FF2400",
      title: "Ticket Logs | Ticket Closed",
      timestamp: true,
      thumbnail: `${interaction.user.displayAvatarURL({ format: "png", dynamic: true, size: 1024 })}`,
      footer: {
        text: `${interaction.user.tag}`,
        iconURL: `${interaction.user.displayAvatarURL({ format: "png", dynamic: true, size: 1024 })}`,
      },
    };

    const logCloseEmbed = await configEmbed("logCloseEmbed", logDefaultValues);

    logCloseEmbed.addFields([
      {
        name: config.logCloseEmbed.field_staff,
        value: `> <@!${interaction.user.id}>\n> ${sanitizeInput(interaction.user.tag)}`,
      },
      {
        name: config.logCloseEmbed.field_user,
        value: `> <@!${ticketUserID.id}>\n> ${sanitizeInput(ticketUserID.tag)}`,
      },
      {
        name: config.logCloseEmbed.field_ticket,
        value: `> #${sanitizeInput(interaction.channel.name)}\n> ${ticketType}`,
      },
    ]);

    if (claimUser)
      logCloseEmbed.addFields({
        name: "• Claimed By",
        value: `> <@!${claimUser.id}>\n> ${sanitizeInput(claimUser.tag)}`,
      });

    let logChannelId = config.logs.ticketClose || config.logs.default;
    let logsChannel = interaction.guild.channels.cache.get(logChannelId);
    await logsChannel.send({ embeds: [logCloseEmbed] });
    logMessage(
      `${interaction.user.tag} closed the ticket #${interaction.channel.name} which was created by ${ticketUserID.tag}`,
    );

    const reOpenButton = new ButtonBuilder()
      .setCustomId("reOpen")
      .setLabel(config.reOpenButton.label)
      .setEmoji(config.reOpenButton.emoji)
      .setStyle(ButtonStyle[config.reOpenButton.style]);

    const transcriptButton = new ButtonBuilder()
      .setCustomId("createTranscript")
      .setLabel(config.transcriptButton.label)
      .setEmoji(config.transcriptButton.emoji)
      .setStyle(ButtonStyle[config.transcriptButton.style]);

    const deleteButton = new ButtonBuilder()
      .setCustomId("deleteTicket")
      .setLabel(config.deleteButton.label)
      .setEmoji(config.deleteButton.emoji)
      .setStyle(ButtonStyle[config.deleteButton.style]);

    let row = new ActionRowBuilder().addComponents(
      reOpenButton,
      transcriptButton,
      deleteButton,
    );

    const defaultValues = {
      color: "#FF2400",
      title: "Ticket Closed",
      description: "This ticket was closed by **{user} ({user.tag})**",
      timestamp: true,
      footer: {
        text: `${interaction.user.tag}`,
        iconURL: `${interaction.user.displayAvatarURL({ format: "png", dynamic: true, size: 1024 })}`,
      },
    };

    const closeEmbed = await configEmbed("closeEmbed", defaultValues);

    if (closeEmbed.data && closeEmbed.data.description) {
      closeEmbed.setDescription(
        closeEmbed.data.description
          .replace(/\{user\}/g, `${interaction.user}`)
          .replace(/\{user\.tag\}/g, sanitizeInput(interaction.user.tag)),
      );
    }

    await interaction.channel.members.forEach((member) => {
      if (member.id !== client.user.id) {
        interaction.channel.permissionOverwrites
          .edit(member, {
            SendMessages: false,
            ViewChannel: true,
          })
          .catch(console.error);
      }
    });

    let messageID;
    await interaction
      .editReply({ embeds: [closeEmbed], components: [row], fetchReply: true })
      .then(async function (message) {
        messageID = message.id;
      });
    await ticketsDB.set(`${interaction.channel.id}.closeMsgID`, messageID);
    await ticketsDB.set(`${interaction.channel.id}.status`, "Closed");
    await mainDB.pull("openTickets", interaction.channel.id);
    if (config.closeRemoveUser) {
      interaction.channel.permissionOverwrites.delete(ticketUserID);
    }
    if (
      config.closeDMEmbed.enabled &&
      interaction.user.id !== ticketUserID.id
    ) {
      const defaultDMValues = {
        color: "#FF0000",
        title: "Ticket Closed",
        description:
          "Your ticket **#{ticketName}** has been closed by {user} in **{server}**.",
      };

      const closeDMEmbed = await configEmbed("closeDMEmbed", defaultDMValues);

      if (closeDMEmbed.data && closeDMEmbed.data.description) {
        closeDMEmbed.setDescription(
          closeDMEmbed.data.description
            .replace(/\{ticketName\}/g, `${interaction.channel.name}`)
            .replace(/\{user\}/g, `<@!${interaction.user.id}>`)
            .replace(/\{server\}/g, `${interaction.guild.name}`),
        );
      }

      try {
        await ticketUserID.send({ embeds: [closeDMEmbed] });
      } catch (error) {
        const defaultErrorValues = {
          color: "#FF0000",
          title: "DMs Disabled",
          description:
            "Please enable `Allow Direct Messages` in this server to receive further information from the bot!\n\nFor help, please read [this article](https://support.discord.com/hc/en-us/articles/217916488-Blocking-Privacy-Settings).",
        };

        const dmErrorEmbed = await configEmbed(
          "dmErrorEmbed",
          defaultErrorValues,
        );

        let logChannelId = config.logs.DMErrors || config.logs.default;
        let logChannel = client.channels.cache.get(logChannelId);
        await logChannel.send({ embeds: [dmErrorEmbed] });
        logMessage(
          `The bot could not DM ${ticketUserID.tag} because their DMs were closed`,
        );
      }
    }

    Object.keys(ticketCategories).forEach(async (id) => {
      if (ticketButton === id) {
        const category = ticketCategories[id];
        await interaction.channel.setParent(category.closedCategoryID, {
          lockPermissions: false,
        });

        category.support_role_ids.forEach(async (roleId) => {
          await interaction.channel.permissionOverwrites
            .edit(roleId, {
              SendMessages: false,
              ViewChannel: true,
            })
            .catch((error) => {
              console.error(
                `Error updating permissions of support roles:`,
                error,
              );
            });
        });
      }
    });
  },
};
