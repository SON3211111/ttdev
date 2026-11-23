export const people = {
  mina: { name: 'Mina Park', initials: 'MP', color: 'rose', online: true },
  daniel: { name: 'Daniel Kim', initials: 'DK', color: 'blue', online: true },
  sophie: { name: 'Sophie Lee', initials: 'SL', color: 'gold', online: true },
  alex: { name: 'Alex Choi', initials: 'AC', color: 'mint', online: false },
  me: { name: 'You', initials: 'Y', color: 'lavender', online: true },
}
export type Person = keyof typeof people
export type Message = {
  id: string
  author: Person
  time: string
  text: string
  title?: string
  attachment?: 'pdf' | 'figma'
  reactions?: { emoji: string; count: number; active?: boolean }[]
  replies?: Message[]
  bookmarked?: boolean
}
export const channels = [
  { id: 'general', description: 'Announcements and team-wide updates' },
  { id: 'project-launch', description: 'Launch planning, decisions, and updates' },
  { id: 'design-feedback', description: 'Share work in progress and design feedback' },
  { id: 'dev-team', description: 'Engineering updates and open questions' },
]
export const directMessages: Person[] = ['mina', 'daniel', 'sophie', 'alex']

export const initialMessages: Record<string, Message[]> = {
  'project-launch': [
    { id: 'kickoff', author: 'mina', time: '9:24 AM', title: 'Kickoff meeting', text: 'Morning, team! Here’s the kickoff deck for Thursday. Please add your notes before 3 PM so we can go into the meeting with a clear plan.', attachment: 'pdf',
      reactions: [{ emoji: '🙌', count: 4 }, { emoji: '🚀', count: 2 }],
      replies: [
        { id: 'r1', author: 'daniel', time: '9:38 AM', text: 'Looks good. I’ll add the engineering milestones before lunch.' },
        { id: 'r2', author: 'sophie', time: '9:46 AM', text: 'I’ll bring two options for the launch announcement.' },
        { id: 'r3', author: 'mina', time: '9:51 AM', text: 'Perfect. Let’s use the first 10 minutes to review what’s still open.' },
      ] },
    { id: 'design', author: 'sophie', time: '10:02 AM', text: 'I pulled the launch screens together in Figma. The onboarding flow is ready for review. Feedback on the empty state would be especially helpful.', attachment: 'figma', reactions: [{ emoji: '👀', count: 3 }, { emoji: '✨', count: 2 }] },
    { id: 'handoff', author: 'daniel', time: '10:18 AM', text: 'Thanks, Sophie. I’ll review the handoff this morning and flag anything that needs a decision before Thursday.', reactions: [{ emoji: '👍', count: 2 }] },
    { id: 'qa', author: 'alex', time: '10:24 AM', text: 'I’ve set aside time for a QA pass after the review. Please drop any edge cases in this channel.' },
    { id: 'next', author: 'mina', time: '10:31 AM', text: 'Great. I’ll pull the owners and deadlines into the kickoff notes after we meet.' },
  ],
  general: [{ id: 'welcome', author: 'mina', time: '9:00 AM', text: 'Welcome to Team Rocket. Use this channel for updates everyone should see.' }],
  'design-feedback': [{ id: 'design-review', author: 'sophie', time: '9:40 AM', text: 'Drop a link and a little context when you’d like feedback on a design.' }],
  'dev-team': [{ id: 'dev-update', author: 'daniel', time: '10:00 AM', text: 'Share progress, open decisions, and blockers here.' }],
  mina: [{ id: 'mina-note', author: 'mina', time: '9:11 AM', text: 'I’m around if you’d like to talk through the launch plan.' }],
}
