The technical interview is a live demo of an agentic application with Weights & Biases (W&B)
Weave instrumented into the application. You can (1) use an existing agent of your choice (ex.
CrewAI templates, a prebuilt OpenAI Cookbook, examples from Smolagents, etc..) and add
Weave, (2) or build your own agent and instrument Weave. In both cases you will be expected
to deep dive into implementation details, explain trade-off decisions, and answer questions
about scaling / deployment.
We don’t expect you to know every detail of Weave expert level. What we are looking for is
breadth of Weave instrumentation, technical rigor, and clarity of presentation. While this doesn’t
need to be a full “production ready” application, we do expect you to answer technical questions
on scaling inference (even if it’s “future work”).
You may use slides to organize your presentation, but the majority of the session should be
screen-sharing your agent application running with Weave including sharing snippets from
your code base. The presentation should take 30 minutes with 15minutes for questions.
For your demo project we expect you to:
1. Instrument Weave into an existing open-source agent or build your own agent and add
Weave. In both cases you will be expected to explain technical implementation details
even if you did not design your own agent (ex. Memory management, evaluations, tool
calling / MCP, etc...).
2. At a minimum the Weave workspace should include:
a. Tracing – capture the full execution flow of the agent (reasoning, tool calls,
outputs).
b. Evaluations – design at least one meaningful evaluation or use a Weave native
scorer.
c. Monitors – configure monitors to track relevant signals (quality, error rate,
performance).

3. Provide a reproducible setup (repo + README / notebook ) so the project can be run by
others.

Extra credit:

○ Create a multi-agent workflow and show how Weave can be integrated.
○ Build a custom evaluation / monitor tailored to your use case.
○ Create a Report with Weave panels included that you use to explain your
application.
○ Perform RL to improve your agent.
i. We recommend using OpenPipe (comes with native Weave integration)

During the presentation, we expect you to:
1. Demo the Application – Show the agent running live, with traces, evaluations, and
monitors (at a minimum) visible in Weave. We encourage you to explore other Weave
features as well.
2. Explain Your Instrumentation Choices – Walk through where and why you placed
traces, what evaluations you defined, and how you set up monitors.
3. Articulate the Value of Weave – Explain how instrumentation improves observability,
reliability, and iteration speed in agent development. Connect this both to developer
workflows and business outcomes.
4. Answer Deep-Dive Questions – Be prepared to go into technical details (e.g., trace
design, monitor thresholds, de-bugging, evaluation logic) when asked.

ProTips
● Sign-up for your free W&B Account here
● We encourage the use of coding agents (Cursor is our favorite) while you build!
● Keep the audience engaged by pausing for questions and encouraging interaction.
● Focus on demonstrating technical outcomes, not just listing features. Build a narrative:
e.g., “Here’s a bug I introduced, here’s how Weave helped me find it.”
● If you encounter challenges or trade-offs, save feedback on those for the end. We value
your feedback as part of the interview and do weigh thoughtful constructive feedback in
the interview process.
● Be ready to discuss how your approach could scale or extend (e.g., adding new agents,
monitoring production workloads).

Please note:

● This is not a mock customer call. The exercise is your chance to demonstrate your
ability to:
○ Build or extend an agent
○ Add Weave into AI applications.
○ Communicate technical decisions clearly
● You should be able to get most of what you need from our documentation and examples,
but feel free to be creative with your approach.
○ For more information please check out our Fully Connected Blog, AI Academy,
and Youtube for more ideas.