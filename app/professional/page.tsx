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
    </section>
  );
}

