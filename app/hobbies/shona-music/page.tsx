export const metadata = {
  title: 'Shona Zimbabwean Music',
  description: 'Member of Mafaro Marimba at the Rattletree School of Music.',
};

export default function ShonaMusicPage() {
  return (
    <article className="card prose">
      <h1>Traditional Shona Zimbabwean Music</h1>
      <p>
        I’m a core member of Mafaro Marimba of the Rattletree School of Music. The interlocking
        rhythms and shared groove are a constant source of joy, especially when we bring the music
        to community stages such as{' '}
        <a
          href="https://heyaustin.com/events/mafaro-marimba-at-africa-night-serumn-sahara-allstars/"
          target="_blank"
          rel="noreferrer"
        >
          Africa Night at Sahara Lounge
        </a>
        .
      </p>
      <p>
        When we’re not on stage, I share performances and arrangement experiments on my{' '}
        <a
          href="https://www.youtube.com/channel/UCg3oUjrSYcqsL9rGk1g_lPQ"
          target="_blank"
          rel="noreferrer"
        >
          YouTube channel
        </a>
        . It’s a good place to hear how Shona repertoire, improvisation, and live looping intersect
        with my network-engineer brain.
      </p>
    </article>
  );
}
