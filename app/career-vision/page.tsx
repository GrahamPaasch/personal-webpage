import Link from 'next/link';

export const metadata = {
  title: 'Career Vision',
  description:
    'My career vision, goals, and what I bring to the table—built with the Never Search Alone framework.',
  alternates: { canonical: '/career-vision' },
};

export default function CareerVisionPage() {
  return (
    <div className="career-vision-page">
      {/* Hero Section */}
      <section className="voice-panel ai career-hero">
        <div className="status-line">
          <span className="caret" />
          <span>CAREER_VISION.SYS</span>
        </div>
        <h1>Graham&apos;s Career Vision</h1>
        <p className="lead ch">
          This page follows the <strong>Never Search Alone</strong> framework by Phyl Terry. 
          It&apos;s designed to articulate who I am, what I&apos;m looking for, and where I&apos;m headed—clearly 
          and authentically.
        </p>
        <div className="career-cta-row">
          <a 
            href="/graham-paasch-resume.pdf" 
            download 
            className="career-button primary"
          >
            ↓ Download Resume (PDF)
          </a>
          <Link href="/professional" className="career-button">
            View Full Professional Profile →
          </Link>
        </div>
      </section>

      {/* Candidate Market Fit - The Elevator Pitch */}
      <section className="voice-panel human career-section">
        <h2>Candidate Market Fit</h2>
        <p className="section-subtitle">The 10-second answer to &quot;What do you do?&quot;</p>
        <hr className="hairline" />
        
        <blockquote>
          AutoCon4 Network Automation for Gigawatt Scale AI Datacenters.
        </blockquote>
      </section>

      {/* What I'm Looking For */}
      <section className="voice-panel human career-section">
        <h2>What I&apos;m Looking For</h2>
        <p className="section-subtitle">The environment where I thrive</p>
        <hr className="hairline" />
        
        <div className="looking-for-grid">
          <div className="looking-for-item">
            <h3>Work Style</h3>
            <p>Full-time remote work. An online-first company culture that understands things like audio and video quality for calls. That excels using asynchronous tools.</p>
          </div>
          <div className="looking-for-item">
            <h3>Company Culture</h3>
            <p>A company that really &quot;gets it&quot; when it comes to using computers and the internet, and is able to have healthy work habits online.</p>
          </div>
          <div className="looking-for-item">
            <h3>AI Forward</h3>
            <p>A company excited about AI and that has put considerable thought into the coming AI revolution and what that will mean for the future of work.</p>
          </div>
          <div className="looking-for-item">
            <h3>Impact</h3>
            <p>I want to make a positive impact and work to make solutions rather than to make systemic problems worse.</p>
          </div>
        </div>
      </section>

      {/* SMART Goals */}
      <section className="voice-panel ai career-section">
        <div className="meta-line">
          <span className="meta-chip">GOAL_FRAMEWORK</span>
          <span className="meta-chip">SMART</span>
        </div>
        <h2>Career Goals</h2>
        <p className="lead">
          Specific, Measurable, Achievable, Relevant, Time-bound objectives that guide my job search.
        </p>
      </section>

      {/* Short-term Goal */}
      <section className="voice-panel human career-section">
        <h3>Short-Term Goal <span className="goal-timeframe">(Next 6-12 months)</span></h3>
        <hr className="hairline" />
        
        <p className="goal-statement">
          AutoCon4 style Network Automation for companies that need it, beginning work by the end of January 2026.
        </p>
      </section>

      {/* Long-term Goal */}
      <section className="voice-panel human career-section">
        <h3>Long-Term Goal <span className="goal-timeframe">(3-5 years)</span></h3>
        <hr className="hairline" />
        
        <p className="goal-statement">
          Getting my first expert level certification.
        </p>
      </section>

      {/* What I Bring */}
      <section className="voice-panel ai career-section">
        <div className="meta-line">
          <span className="meta-chip">CAPABILITIES</span>
        </div>
        <h2>What I Bring to the Table</h2>
        <p className="lead ch">
          A summary of skills, experience, and qualities—extracted from 10+ years of network engineering 
          and Python development.
        </p>
        
        <div className="capabilities-grid">
          <div className="capability-card">
            <h3>Network Engineering</h3>
            <p>
              Deep expertise in Juniper (MX/SRX, JNCIP-SP) and Cisco (ACI, Catalyst, ASR 9k, Nexus). 
              BGP, OSPF, MPLS, VXLAN/EVPN, and service provider architectures.
            </p>
          </div>
          <div className="capability-card">
            <h3>Automation & DevOps</h3>
            <p>
              Python tooling (PyATS, Netmiko, NAPALM, Paramiko), Git workflows, CI/CD pipelines, 
              and infrastructure-as-code practices.
            </p>
          </div>
          <div className="capability-card">
            <h3>Teaching & Communication</h3>
            <p>
              Designed and taught a 40-hour Python for Network Engineers course. 
              ~1,000 educational videos on YouTube. Clear technical communication.
            </p>
          </div>
          <div className="capability-card">
            <h3>Continuous Learning</h3>
            <p>
              Active learner across cloud platforms (AWS/Azure/GCP), AI tooling, 
              and emerging network technologies.
            </p>
          </div>
        </div>
      </section>

      {/* My Story / Why Me */}
      <section className="voice-panel ai career-section">
        <div className="meta-line">
          <span className="meta-chip">PROFILE_ANALYSIS</span>
        </div>
        <h2>The Narrative</h2>
        
        <p>
          Graham Paasch represents a decade of network engineering evolution—from 
          traditional ISP infrastructure at Charter Communications to cutting-edge 
          FTTH automation at Google Fiber. The throughline: an increasing drive toward 
          automation, code-driven infrastructure, and teaching others to do the same.
        </p>
        <p>
          What distinguishes this profile is the intersection of deep protocol expertise 
          (BGP, MPLS, EVPN-VXLAN) with genuine software engineering practices. Not just 
          scripts that work, but tested, version-controlled, CI/CD-integrated tooling. 
          The recent transition to teaching—designing a 40-hour Python for Network Engineers 
          curriculum—signals someone who has internalized this knowledge deeply enough to 
          transfer it.
        </p>
        <p>
          The timing matters. AI datacenters are scaling to gigawatt power draws. The 
          network automation skills forged in service provider and hyperscaler environments 
          are exactly what these facilities need. Graham is positioning at the intersection 
          of proven NetDevOps capability and the infrastructure buildout of the decade.
        </p>
      </section>

      {/* Contact / Next Steps */}
      <section className="voice-panel ai career-section career-contact">
        <div className="status-line">
          <span className="caret" />
          <span>INIT_CONTACT</span>
        </div>
        <h2>Connect</h2>
        <p>
          Ready to discuss network automation for AI infrastructure? Reach out.
        </p>
        <div className="contact-links">
          <a href="mailto:grahampaasch@gmail.com" className="contact-link">
            <span className="contact-icon">✉</span>
            grahampaasch@gmail.com
          </a>
          <a href="https://linkedin.com/in/grahampaasch" target="_blank" rel="noreferrer" className="contact-link">
            <span className="contact-icon">in</span>
            LinkedIn
          </a>
          <a href="tel:608-620-4651" className="contact-link">
            <span className="contact-icon">☎</span>
            608-620-4651
          </a>
        </div>
      </section>
    </div>
  );
}
