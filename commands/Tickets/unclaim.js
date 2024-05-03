const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const fs = require("fs");
const yaml = require("yaml");
const configFile = fs.readFileSync("./config.yml", "utf8");
const config = yaml.parse(configFile);
const {
  ticketsDB,
  sanitizeInput,
  logMessage,
  ticketCategories,
  mainDB,
  checkSupportRole,
  configEmbed,
} = require("../../index.js");

module.exports = {
  enabled: config.commands.unclaim.enabled,
  data: new SlashCommandBuilder()
    .setName("unclaim")
    .setDescription("Unclaim a ticket")
    .setDefaultMemberPermissions(
      PermissionFlagsBits[config.commands.unclaim.permission],
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

    if (config.claimFeature === false) {
      return interaction.reply({
        content: "The claim feature is currently disabled.",
        ephemeral: true,
      });
    }

    if ((await ticketsDB.get(`${interaction.channel.id}.claimed`)) === false) {
      return interaction.reply({
        content: "This ticket has not been claimed!",
        ephemeral: true,
      });
    }

    if (
      (await ticketsDB.get(`${interaction.channel.id}.claimUser`)) !==
      interaction.user.id
    ) {
      return interaction.reply({
        content: `You did not claim this ticket, only the user that claimed this ticket can unclaim it! (<@!${await ticketsDB.get(`${interaction.channel.id}.claimUser`)}>)`,
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });
    const totalClaims = await mainDB.get("totalClaims");

    let ticketButton = await ticketsDB.get(`${interaction.channel.id}.button`);

    Object.keys(ticketCategories).forEach(async (id) => {
      if (ticketButton === id) {
        ticketCategories[id].support_role_ids.forEach(async (roleId) => {
          await interaction.channel.permissionOverwrites
            .edit(roleId, {
              SendMessages: true,
              ViewChannel: true,
            })
            .catch((error) => {
              console.error(`Error updating permissions:`, error);
            });
        });
      }
    });

    const defaultValues = {
      color: "#FF2400",
      title: "Ticket Unclaimed",
      description: `This ticket has been unclaimed by {user}.`,
      timestamp: true,
      footer: {
        text: `Unclaimed by ${interaction.user.tag}`,
        iconURL: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
      },
    };

    const unclaimedEmbed = await configEmbed("unclaimedEmbed", defaultValues);

    if (unclaimedEmbed.data && unclaimedEmbed.data.description) {
      unclaimedEmbed.setDescription(
        unclaimedEmbed.data.description.replace(/\{user\}/g, interaction.user),
      );
    }

    await interaction.editReply({
      content: "You successfully unclaimed this ticket!",
      ephemeral: true,
    });
    interaction.channel.permissionOverwrites.delete(interaction.user);
    interaction.channel.send({ embeds: [unclaimedEmbed] });

    interaction.channel.messages
      .fetch(await ticketsDB.get(`${interaction.channel.id}.msgID`))
      .then(async (message) => {
        const embed = message.embeds[0];
        embed.fields.pop();

        const closeButton = new ButtonBuilder()
          .setCustomId("closeTicket")
          .setLabel(config.closeButton.label)
          .setEmoji(config.closeButton.emoji)
          .setStyle(ButtonStyle[config.closeButton.style]);

        const claimButton = new ButtonBuilder()
          .setCustomId("ticketclaim")
          .setLabel(config.claimButton.label)
          .setEmoji(config.claimButton.emoji)
          .setStyle(ButtonStyle[config.claimButton.style]);

        let actionRow3 = new ActionRowBuilder().addComponents(
          closeButton,
          claimButton,
        );

        message.edit({ embeds: [embed], components: [actionRow3] });

        await ticketsDB.set(`${interaction.channel.id}.claimed`, false);
        await ticketsDB.set(`${interaction.channel.id}.claimUser`, "");

        let logChannelId = config.logs.ticketUnclaim || config.logs.default;
        let logsChannel = interaction.guild.channels.cache.get(logChannelId);

        const logDefaultValues = {
          color: "#FF2400",
          title: "Ticket Logs | Ticket Unclaimed",
          timestamp: true,
          thumbnail: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
          footer: {
            text: `${interaction.user.tag}`,
            iconURL: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
          },
        };

        const logUnclaimedEmbed = await configEmbed(
          "logUnclaimedEmbed",
          logDefaultValues,
        );

        logUnclaimedEmbed.addFields([
          {
            name: config.logUnclaimedEmbed.field_staff,
            value: `> <@!${interaction.user.id}>\n> ${sanitizeInput(interaction.user.tag)}`,
          },
          {
            name: config.logUnclaimedEmbed.field_staff,
            value: `> <#${interaction.channel.id}>\n> #${sanitizeInput(interaction.channel.name)}\n> ${await ticketsDB.get(`${interaction.channel.id}.ticketType`)}`,
          },
        ]);

        if (config.toggleLogs.ticketUnclaim) {
          await logsChannel.send({ embeds: [logUnclaimedEmbed] });
        }
        await mainDB.set("totalClaims", totalClaims - 1);
        logMessage(
          `${interaction.user.tag} unclaimed the ticket #${interaction.channel.name}`,
        );
      });
  },
};
