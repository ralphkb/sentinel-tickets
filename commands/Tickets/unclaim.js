const {
  EmbedBuilder,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const fs = require('fs');
const yaml = require('yaml');
const configFile = fs.readFileSync('./config.yml', 'utf8');
const config = yaml.parse(configFile);
const {
  ticketsDB,
  sanitizeInput,
  logMessage,
  ticketCategories,
} = require('../../index.js');

module.exports = {
  enabled: config.commands.unclaim.enabled,
  data: new SlashCommandBuilder()
    .setName('unclaim')
    .setDescription('Unclaim a ticket')
    .setDefaultMemberPermissions(
      PermissionFlagsBits[config.commands.unclaim.permission],
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

    if (config.claimFeature === false) {
      return interaction.reply({
        content: 'The claim feature is currently disabled.',
        ephemeral: true,
      });
    }

    if ((await ticketsDB.get(`${interaction.channel.id}.claimed`)) === false) {
      return interaction.reply({
        content: 'This ticket has not been claimed!',
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

    let ticketButton = await ticketsDB.get(`${interaction.channel.id}.button`);

    Object.keys(ticketCategories).forEach(async (id) => {
      if (ticketButton === id) {
        config.support_role_ids.forEach(async (roleId) => {
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

    const embed = new EmbedBuilder()
      .setTitle('Ticket Unclaimed')
      .setColor('#FF2400')
      .setDescription(
        `This ticket has been unclaimed by <@!${interaction.user.id}>`,
      )
      .setTimestamp()
      .setFooter({
        text: `Unclaimed by ${interaction.user.tag}`,
        iconURL: `${interaction.user.displayAvatarURL({ dynamic: true })}`,
      });
    interaction.editReply({
      content: 'You successfully unclaimed this ticket!',
      ephemeral: true,
    });
    interaction.channel.send({ embeds: [embed] });

    interaction.channel.messages
      .fetch(await ticketsDB.get(`${interaction.channel.id}.msgID`))
      .then(async (message) => {
        const embed = message.embeds[0];
        embed.fields[embed.fields.length - 1] = {
          name: 'Claimed by',
          value: '> This ticket has not been claimed!',
        };

        const closeButton = new ButtonBuilder()
          .setCustomId('closeTicket')
          .setLabel(config.closeButton.label)
          .setEmoji(config.closeButton.emoji)
          .setStyle(ButtonStyle[config.closeButton.style]);

        const claimButton = new ButtonBuilder()
          .setCustomId('ticketclaim')
          .setLabel(config.claimButton.label)
          .setEmoji(config.claimButton.emoji)
          .setStyle(ButtonStyle[config.claimButton.style]);

        let actionRow3 = new ActionRowBuilder().addComponents(
          closeButton,
          claimButton,
        );

        message.edit({ embeds: [embed], components: [actionRow3] });

        await ticketsDB.set(`${interaction.channel.id}.claimed`, false);
        await ticketsDB.set(`${interaction.channel.id}.claimUser`, '');

        let logsChannel = interaction.guild.channels.cache.get(
          config.logs_channel_id,
        );

        const logEmbed = new EmbedBuilder()
          .setColor('#FF2400')
          .setTitle('Ticket Logs | Ticket Unclaimed')
          .addFields([
            {
              name: '• Executor',
              value: `> <@!${interaction.user.id}>\n> ${sanitizeInput(interaction.user.tag)}`,
            },
            {
              name: '• Ticket',
              value: `> <#${interaction.channel.id}>\n> #${sanitizeInput(interaction.channel.name)}\n> ${await ticketsDB.get(`${interaction.channel.id}.ticketType`)}`,
            },
          ])
          .setTimestamp()
          .setThumbnail(
            interaction.user.displayAvatarURL({
              format: 'png',
              dynamic: true,
              size: 1024,
            }),
          )
          .setFooter({
            text: `${interaction.user.tag}`,
            iconURL: `${interaction.user.displayAvatarURL({ format: 'png', dynamic: true, size: 1024 })}`,
          });
        logsChannel.send({ embeds: [logEmbed] });
        logMessage(
          `${interaction.user.tag} unclaimed the ticket #${interaction.channel.name}`,
        );
      });
  },
};
