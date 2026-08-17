# Group Conversations

Groups use `Conversation.conversationType = GROUP` and `externalChatId = remoteJid`.

Rules implemented:
- A group webhook creates or reuses one conversation for tenant + connection + group remote JID.
- Participants are stored separately in `ConversationParticipant`.
- Group messages do not create individual direct conversations.
- Group messages do not create individual leads by default.

The env flag `NEXOS_MESSAGE_ALLOW_GROUP_CONVERSATIONS` is documented, but runtime enforcement still needs a configuration service pass.

