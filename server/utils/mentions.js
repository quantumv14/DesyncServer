import User from '../models/User.js';
import Mention from '../models/Mention.js';
import Notification from '../models/Notification.js';

/**
 * Parse mentions from text
 * Matches @username patterns
 * @param {string} text - Text to parse for mentions
 * @returns {Array<string>} - Array of unique usernames mentioned
 */
export function parseMentions(text) {
  const mentionRegex = /@(\w{3,20})/g;
  const mentions = [];
  let match;
  
  while ((match = mentionRegex.exec(text)) !== null) {
    const username = match[1];
    if (!mentions.includes(username)) {
      mentions.push(username);
    }
  }
  
  return mentions;
}

/**
 * Create mention records and notifications
 * @param {string} content - Content with mentions
 * @param {string} contentType - Type: 'thread', 'post', 'message'
 * @param {number} contentId - ID of the content
 * @param {number} mentionedByUid - UID of user creating the mention
 * @param {number} threadId - Thread ID (optional, for context)
 * @returns {Promise<Array>} - Array of created mentions
 */
export async function createMentionsFromContent(content, contentType, contentId, mentionedByUid, threadId = null) {
  const usernames = parseMentions(content);
  
  if (usernames.length === 0) {
    return [];
  }
  
  // Rate limiting: max 5 mentions per post
  if (usernames.length > 5) {
    throw new Error('Too many mentions. Maximum 5 mentions per post.');
  }
  
  const mentions = [];
  const mentioner = await User.findOne({ uid: mentionedByUid });
  
  for (const username of usernames) {
    // Find user
    const user = await User.findOne({ username: { $regex: new RegExp(`^${username}$`, 'i') } });
    
    if (!user || user.uid === mentionedByUid) {
      // Skip if user not found or self-mention
      continue;
    }
    
    // Check for duplicate mention in same content
    const existingMention = await Mention.findOne({
      mentionedUid: user.uid,
      contentType,
      contentId
    });
    
    if (existingMention) {
      continue;
    }
    
    // Create mention record
    const mention = new Mention({
      mentionedUid: user.uid,
      mentionedByUid,
      contentType,
      contentId,
      threadId,
      content: content.substring(0, 500)
    });
    
    await mention.save();
    mentions.push(mention);
    
    // Create notification
    let notificationTitle = 'You were mentioned';
    let notificationMessage = `${mentioner.username} mentioned you in a ${contentType}`;
    
    await Notification.createNotification(
      user.uid,
      'mention',
      notificationTitle,
      notificationMessage,
      {
        contentType,
        contentId,
        threadId
      },
      contentId,
      mentionedByUid
    );
  }
  
  return mentions;
}

/**
 * Replace mentions in text with clickable links (for rendering)
 * @param {string} text - Text containing mentions
 * @returns {string} - Text with mentions replaced
 */
export function linkifyMentions(text) {
  const mentionRegex = /@(\w{3,20})/g;
  return text.replace(mentionRegex, (match, username) => {
    return `<a href="/profile/${username}" class="mention">@${username}</a>`;
  });
}

/**
 * Get mentions for a user
 * @param {number} userUid - User UID
 * @param {boolean} unreadOnly - Only unread mentions
 * @param {number} limit - Limit results
 * @returns {Promise<Array>} - Array of mentions
 */
export async function getMentionsForUser(userUid, unreadOnly = false, limit = 20) {
  const query = { mentionedUid: userUid };
  
  if (unreadOnly) {
    query.read = false;
  }
  
  const mentions = await Mention.find(query)
    .sort({ createdAt: -1 })
    .limit(limit);
  
  return mentions;
}

export default {
  parseMentions,
  createMentionsFromContent,
  linkifyMentions,
  getMentionsForUser
};

