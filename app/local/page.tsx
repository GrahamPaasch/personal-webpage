'use client';
import { useState } from 'react';

export default function LocalPage() {
  const examples = [
    {
      title: 'UI Scaffold',
      description: 'Responsive task management layout',
      input: 'Create clean UI for task list with drag-and-drop',
      output: 'React DnD component with Tailwind mobile responsiveness',
      quality: '5s | Clear',
    },
    {
      title: 'Bug Triage',
      description: 'Analyze and categorize bug report',
      input: 'Analyze: "App crashes on iOS when opening camera"',
      output: 'Category: Camera API, Severity: High, Fix: Check permissions',
      quality: 'Actionable | 3s',
    },
    {
      title: 'Refactor Plan',
      description: 'Improve legacy function readability',
      input: 'Refactor this function for maintainability',
      output: 'Split into smaller functions with descriptive names',
      quality: 'Clear | 2s',
    },
    {
      title: 'Writing Draft',
      description: 'Technical blog introduction',
      input: 'Write intro for local AI development post',
      output: 'Explains privacy benefits and speed without cloud costs',
      quality: 'Concise | 4s',
    },
  ];

  const [currentIndex, setCurrentIndex] = useState(0);

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % examples.length);
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Hero Section */}
      <div className="text-center mb-16">
        <h1 className="text-4xl md:text-5xl font-bold mb-4">
          Local AI Lab
        </h1>
        <p className="text-xl text-gray-600 mb-6">
          Work produced locally on RTX 3090 (Aider + Ollama)
        </p>
        <div className="inline-flex items-center bg-blue-50 text-blue-800 text-sm font-medium px-3 py-1 rounded-full">
          <span className="bg-blue-100 rounded-full w-2 h-2 mr-2"></span>
          Local | RTX 3090 | Ollama | Aider
        </div>
      </div>

      {/* Showcase Grid */}
      <div className="mb-12">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">Local AI Output</h2>
          <button
            onClick={handleNext}
            className="text-blue-600 hover:text-blue-800 font-medium text-sm"
          >
            Next Example →
          </button>
        </div>
        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
          <h3 className="text-xl font-bold mb-2">{examples[currentIndex].title}</h3>
          <p className="text-gray-600 mb-3">{examples[currentIndex].description}</p>
          <div className="bg-gray-50 p-3 rounded mb-3">
            <span className="text-xs text-gray-500">Input:</span>
            <div className="text-sm mt-1">{examples[currentIndex].input}</div>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <span className="text-xs text-gray-500">Output:</span>
            <div className="text-sm mt-1">{examples[currentIndex].output}</div>
          </div>
          <div className="mt-3 text-xs text-blue-600">{examples[currentIndex].quality}</div>
        </div>
      </div>

      {/* Workbench Section */}
      <div className="mb-12">
        <h2 className="text-2xl font-bold mb-4">Why Local?</h2>
        <ul className="space-y-3">
          {[
            'Private local iteration (no cloud dependencies)',
            'Fast prompt refinement (sub-second feedback)',
            'Cheap repeated experiments (no API costs)',
            'Ideal for drafts, scaffolds, and exploration'
          ].map((item, i) => (
            <li key={i} className="flex items-start">
              <span className="text-blue-500 mr-2 mt-1">✓</span>
              {item}
            </li>
          ))}
        </ul>
      </div>

      {/* Iteration Log */}
      <div className="mb-12">
        <h2 className="text-2xl font-bold mb-4">Iteration Log</h2>
        <div className="space-y-3">
          {[
            { attempt: 'Attempt 1', result: 'Too broad' },
            { attempt: 'Attempt 2', result: 'Better constraints' },
            { attempt: 'Attempt 3', result: 'Useful result' }
          ].map((log, i) => (
            <div key={i} className="flex justify-between items-center">
              <span className="text-gray-600">{log.attempt}</span>
              <span className="text-blue-500">→</span>
              <span className="text-gray-600">{log.result}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-gray-500 text-sm">
        This page is a live proving ground for local AI-assisted building
      </div>
    </div>
  );
}
