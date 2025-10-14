export const metadata = {
  title: 'Viola',
  description: 'Core member of the Central Texas Medical Orchestra.',
};

export default function ViolaPage() {
  return (
    <article className="card prose">
      <h1>Viola</h1>
      <p>
        I perform as a core member of the{' '}
        <a href="https://www.ctmorchestra.org/" target="_blank" rel="noreferrer">
          Central Texas Medical Orchestra
        </a>
        . Playing viola keeps me listening closely—balance, timing, and harmony are everything.
      </p>
      <p>
        CTMO unites Austin musicians and healthcare professionals to raise funds for local clinics.
        The mission resonates with me: music as mutual care, not just performance.
      </p>
    </article>
  );
}
