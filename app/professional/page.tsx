export const metadata = {
  title: 'Professional',
  description: 'Network engineering + Python development experience.',
};

export default function ProfessionalPage() {
  return (
    <section className="grid">
      <article className="card">
        <h1>Professional</h1>
        <p>
          I have 10 years of experience blending network engineering with Python development—
          building automation, resilient networks, and clear interfaces for humans and machines.
        </p>
      </article>

      <article className="card half">
        <h2>Certifications</h2>
        <p>
          Earned <strong>CCNP-RS</strong> and <strong>JNCIP-SP</strong> (both expired). The study and
          practice were invaluable and continue to inform my work.
        </p>
      </article>

      <article className="card half">
        <h2>Focus</h2>
        <p>
          Network automation, infrastructure-as-code, observability, API design, and
          Python tooling that teams actually want to use.
        </p>
      </article>

      <article className="card half">
        <h2>Find me online</h2>
        <ul>
          <li>
            <a href="https://www.linkedin.com/in/grahampaasch/" target="_blank" rel="noreferrer">
              LinkedIn
            </a>{' '}
            — current role, collaboration interests, and references.
          </li>
          <li>
            <a href="https://github.com/GrahamPaasch" target="_blank" rel="noreferrer">
              GitHub
            </a>{' '}
            — automation tooling, infrastructure demos, and personal experiments.
          </li>
          <li>
            <a href="https://huggingface.co/gpaasch" target="_blank" rel="noreferrer">
              Hugging Face
            </a>{' '}
            — models and datasets from ongoing R&D.
          </li>
        </ul>
      </article>
    </section>
  );
}
