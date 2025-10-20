export type PromptItem = {
  useCase: string;
  prompt: string;
  url: string;
};

export type PromptCategory = {
  id: string;
  title: string;
  description: string;
  items: PromptItem[];
};

export const promptCategories: PromptCategory[] = [
  {
    id: 'communication-writing',
    title: 'Communication & writing',
    description: 'ChatGPT supports creating drafts, polishing copy, and adapting everyday workplace communications.',
    items: [
      {
        useCase: 'Write a professional email',
        prompt: 'Write a professional email to [recipient]. The email is about [topic] and should be polite, clear, and concise. Provide a subject line and a short closing.',
        url: 'https://chatgpt.com/?prompt=Draft%20an%20email%20to%20%5Brecipient%5D%20about%20%5Btopic%5D.%20Keep%20it%20clear%2C%20polite%2C%20and%20concise.',
      },
      {
        useCase: 'Rewrite for clarity',
        prompt: 'Rewrite the following text so it is easier to understand. The text will be used in a professional setting. Ensure the tone is clear, respectful, and concise. Text: [paste text].',
        url: 'https://chatgpt.com/?prompt=Rewrite%20the%20following%20text%20so%20it%20is%20easier%20to%20understand.%20The%20text%20will%20be%20used%20in%20a%20professional%20setting.%20Ensure%20the%20tone%20is%20clear%2C%20respectful%2C%20and%20concise.%20Text%3A%20%5Bpaste%20text%5D.',
      },
      {
        useCase: 'Adapt message for audience',
        prompt: 'Reframe this message for [audience type: executives, peers, or customers]. The message was originally written for [context]. Adjust tone, word choice, and style to fit the intended audience. Text: [paste text].',
        url: 'https://chatgpt.com/?prompt=Reframe%20this%20message%20for%20%5Baudience%20type%3A%20executives%2C%20peers%2C%20or%20customers%5D.%20The%20message%20was%20originally%20written%20for%20%5Bcontext%5D.%20Adjust%20tone%2C%20word%20choice%2C%20and%20style%20to%20fit%20the%20intended%20audience.%20Text%3A%20%5Bpaste%20text%5D.',
      },
      {
        useCase: 'Draft meeting invite',
        prompt: 'Draft a meeting invitation for a session about [topic]. The meeting will include [attendees/roles] and should outline agenda items, goals, and preparation required. Provide the text in calendar-invite format.',
        url: 'https://chatgpt.com/?prompt=Draft%20a%20meeting%20invitation%20for%20a%20session%20about%20%5Btopic%5D.%20The%20meeting%20will%20include%20%5Battendees%2Froles%5D%20and%20should%20outline%20agenda%20items%2C%20goals%2C%20and%20preparation%20required.%20Provide%20the%20text%20in%20calendar-invite%20format.',
      },
      {
        useCase: 'Summarize long email',
        prompt: 'Summarize this email thread into a short recap. The thread includes several back-and-forth messages. Highlight key decisions, action items, and open questions. Email: [paste text].',
        url: 'https://chatgpt.com/?prompt=Summarize%20this%20email%20thread%20into%20a%20short%20recap.%20The%20thread%20includes%20several%20back-and-forth%20messages.%20Highlight%20key%20decisions%2C%20action%20items%2C%20and%20open%20questions.%20Email%3A%20%5Bpaste%20text%5D.',
      },
    ],
  },
  {
    id: 'meetings-collaboration',
    title: 'Meetings & collaboration',
    description: 'ChatGPT helps streamline preparation, note-taking, and follow-up.',
    items: [
      {
        useCase: 'Create a meeting agenda',
        prompt: 'Create a structured agenda for a meeting about [topic]. The meeting will last [time] and include [attendees]. Break the agenda into sections with time estimates and goals for each section.',
        url: 'https://chatgpt.com/?prompt=Create%20a%20structured%20agenda%20for%20a%20meeting%20about%20%5Btopic%5D.%20The%20meeting%20will%20last%20%5Btime%5D%20and%20include%20%5Battendees%5D.%20Break%20the%20agenda%20into%20sections%20with%20time%20estimates%20and%20goals%20for%20each%20section.',
      },
      {
        useCase: 'Summarize meeting notes',
        prompt: 'Summarize these meeting notes into a structured recap. The notes are rough and informal. Organize them into categories: key decisions, next steps, and responsibilities. Notes: [paste text].',
        url: 'https://chatgpt.com/?prompt=Summarize%20these%20meeting%20notes%20into%20a%20structured%20recap.%20The%20notes%20are%20rough%20and%20informal.%20Organize%20them%20into%20categories%3A%20key%20decisions%2C%20next%20steps%2C%20and%20responsibilities.%20Notes%3A%20%5Bpaste%20text%5D.',
      },
      {
        useCase: 'Create an action items list',
        prompt: 'Turn the following meeting notes into a clean task list. The tasks should be grouped by owner and include deadlines if mentioned. Notes: [paste text].',
        url: 'https://chatgpt.com/?prompt=Turn%20the%20following%20meeting%20notes%20into%20a%20clean%20task%20list.%20The%20tasks%20should%20be%20grouped%20by%20owner%20and%20include%20deadlines%20if%20mentioned.%20Notes%3A%20%5Bpaste%20text%5D.',
      },
      {
        useCase: 'Prep questions for a meeting',
        prompt: 'Suggest thoughtful questions to ask in a meeting about [topic]. The purpose of the meeting is [purpose]. Provide a list of at least 5 questions that show preparation and insight.',
        url: 'https://chatgpt.com/?prompt=Suggest%20thoughtful%20questions%20to%20ask%20in%20a%20meeting%20about%20%5Btopic%5D.%20The%20purpose%20of%20the%20meeting%20is%20%5Bpurpose%5D.%20Provide%20a%20list%20of%20at%20least%205%20questions%20that%20show%20preparation%20and%20insight.',
      },
      {
        useCase: 'Draft follow-up email',
        prompt: 'Write a professional follow-up email after a meeting about [topic]. Include a recap of key points, assigned responsibilities, and next steps with deadlines. Use a clear and polite tone.',
        url: 'https://chatgpt.com/?prompt=Write%20a%20professional%20follow-up%20email%20after%20a%20meeting%20about%20%5Btopic%5D.%20Include%20a%20recap%20of%20key%20points%2C%20assigned%20responsibilities%2C%20and%20next%20steps%20with%20deadlines.%20Use%20a%20clear%20and%20polite%20tone.',
      },
    ],
  },
  {
    id: 'analysis-decision',
    title: 'Analysis & decision-making',
    description: 'Guide ChatGPT through structured thinking to diagnose issues, weigh tradeoffs, and recommend next steps.',
    items: [
      {
        useCase: 'Identify root cause',
        prompt: 'Analyze the following workplace issue: [describe issue]. The context is that the problem has occurred multiple times. Identify possible root causes and suggest questions to confirm them.',
        url: 'https://chatgpt.com/?prompt=Analyze%20the%20following%20workplace%20issue%3A%20%5Bdescribe%20issue%5D.%20The%20context%20is%20that%20the%20problem%20has%20occurred%20multiple%20times.%20Identify%20possible%20root%20causes%20and%20suggest%20questions%20to%20confirm%20them.',
      },
      {
        useCase: 'Compare options',
        prompt: 'Compare the following two or more possible solutions: [list options]. The decision needs to be made in [timeframe]. Evaluate pros, cons, and potential risks for each option.',
        url: 'https://chatgpt.com/?prompt=Compare%20the%20following%20two%20or%20more%20possible%20solutions%3A%20%5Blist%20options%5D.%20The%20decision%20needs%20to%20be%20made%20in%20%5Btimeframe%5D.%20Evaluate%20pros%2C%20cons%2C%20and%20potential%20risks%20for%20each%20option.',
      },
      {
        useCase: 'Decision criteria',
        prompt: 'Help define clear decision-making criteria for [describe decision]. The context is that multiple stakeholders are involved. Provide a short list of weighted criteria to guide the choice.',
        url: 'https://chatgpt.com/?prompt=Help%20define%20clear%20decision-making%20criteria%20for%20%5Bdescribe%20decision%5D.%20The%20context%20is%20that%20multiple%20stakeholders%20are%20involved.%20Provide%20a%20short%20list%20of%20weighted%20criteria%20to%20guide%20the%20choice.',
      },
      {
        useCase: 'Risk assessment',
        prompt: 'Assess the potential risks of the following plan: [describe plan]. The plan is set to start on [date]. List risks by likelihood and impact, and suggest mitigation strategies.',
        url: 'https://chatgpt.com/?prompt=Assess%20the%20potential%20risks%20of%20the%20following%20plan%3A%20%5Bdescribe%20plan%5D.%20The%20plan%20is%20set%20to%20start%20on%20%5Bdate%5D.%20List%20risks%20by%20likelihood%20and%20impact%2C%20and%20suggest%20mitigation%20strategies.',
      },
      {
        useCase: 'Recommend best option',
        prompt: 'Based on the following background: [describe situation and options], recommend the most suitable option. Explain your reasoning clearly and suggest first steps for implementation.',
        url: 'https://chatgpt.com/?prompt=Based%20on%20the%20following%20background%3A%20%5Bdescribe%20situation%20and%20options%5D%2C%20recommend%20the%20most%20suitable%20option.%20Explain%20your%20reasoning%20clearly%20and%20suggest%20first%20steps%20for%20implementation.',
      },
    ],
  },
  {
    id: 'organization-productivity',
    title: 'Organization & productivity',
    description: 'ChatGPT helps structure tasks, time, and priorities.',
    items: [
      {
        useCase: 'Document daily priorities',
        prompt: 'Create a prioritized to-do list from the following tasks: [paste tasks]. The context is a typical workday with limited time. Suggest which tasks should be done first and why.',
        url: 'https://chatgpt.com/?prompt=Create%20a%20prioritized%20to-do%20list%20from%20the%20following%20tasks%3A%20%5Bpaste%20tasks%5D.%20The%20context%20is%20a%20typical%20workday%20with%20limited%20time.%20Suggest%20which%20tasks%20should%20be%20done%20first%20and%20why.',
      },
      {
        useCase: 'Create a weekly plan',
        prompt: 'Build a weekly work plan for [describe role or situation]. The week includes deadlines, meetings, and individual focus time. Provide a balanced schedule with recommended priorities.',
        url: 'https://chatgpt.com/?prompt=Build%20a%20weekly%20work%20plan%20for%20%5Bdescribe%20role%20or%20situation%5D.%20The%20week%20includes%20deadlines%2C%20meetings%2C%20and%20individual%20focus%20time.%20Provide%20a%20balanced%20schedule%20with%20recommended%20priorities.',
      },
      {
        useCase: 'Summarize a long document',
        prompt: 'Summarize the following document into 5 key points and 3 recommended actions. The document is [type: report, plan, or notes]. Keep the summary concise and professional. Text: [paste document].',
        url: 'https://chatgpt.com/?prompt=Summarize%20the%20following%20document%20into%205%20key%20points%20and%203%20recommended%20actions.%20The%20document%20is%20%5Btype%3A%20report%2C%20plan%2C%20or%20notes%5D.%20Keep%20the%20summary%20concise%20and%20professional.%20Text%3A%20%5Bpaste%20document%5D.',
      },
      {
        useCase: 'Brainstorm solutions',
        prompt: 'Brainstorm potential solutions to the following workplace challenge: [describe challenge]. Provide at least 5 varied ideas, noting pros and cons for each.',
        url: 'https://chatgpt.com/?prompt=Brainstorm%20potential%20solutions%20to%20the%20following%20workplace%20challenge%3A%20%5Bdescribe%20challenge%5D.%20Provide%20at%20least%205%20varied%20ideas%2C%20noting%20pros%20and%20cons%20for%20each.',
      },
      {
        useCase: 'Write a project update',
        prompt: 'Draft a short project update for stakeholders. The project is [describe project]. Include progress made, current blockers, and next steps. Write in a professional, concise style.',
        url: 'https://chatgpt.com/?prompt=Draft%20a%20short%20project%20update%20for%20stakeholders.%20The%20project%20is%20%5Bdescribe%20project%5D.%20Include%20progress%20made%2C%20current%20blockers%2C%20and%20next%20steps.%20Write%20in%20a%20professional%2C%20concise%20style.',
      },
    ],
  },
];
