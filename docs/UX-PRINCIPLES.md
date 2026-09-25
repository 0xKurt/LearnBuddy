# UX principles — hide system complexity, keep understanding and control

> Source of truth for how LearnBuddy is presented (provided by the product owner, 2026-09-25).
> Applied to LearnBuddy: Buddy is the one assistant and the home; practice is the one
> specialised workflow with its own screen; everything else is the conversation, a suggestion,
> the camera, or closed until opened. See CLAUDE.md rule 16 and docs/architecture.md §Home.

    MOBILE AI ASSISTANT — USER-FACING UI/UX PRINCIPLES

    IMPORTANT:
    This document is a design framework, not a fixed screen specification.

    The UI must always be adapted to:
    - the specific assistant
    - the assistant’s purpose
    - the primary user use case
    - the frequency and complexity of tasks
    - the consequences of actions
    - the amount of user control required
    - the expected interaction style
    - the context in which the app is used

    Different assistants have different needs.

    A travel assistant, personal assistant, writing assistant, medical information assistant, finance assistant, business operations assistant, research assistant, or scheduling assistant should NOT automatically share the same information architecture.

    The goal is not to force every AI assistant into the same UI.

    The goal is to apply the same underlying principle:

    HIDE SYSTEM COMPLEXITY WHILE PRESERVING USER UNDERSTANDING AND CONTROL.


    --------------------------------------------------
    1. CORE PRODUCT PRINCIPLE
    --------------------------------------------------

    The app should feel like one coherent assistant, not like a collection of AI tools.

    The user should primarily express what they want to accomplish.

    The system should internally determine:
    - which tools are needed
    - which models are needed
    - which data sources are needed
    - which agents or sub-agents are needed
    - which intermediate steps are required
    - how the task should be coordinated

    These implementation details should normally remain invisible.

    Preferred mental model:

    INTENT
    → EXECUTION
    → RESULT

    Avoid exposing:

    FEATURE
    → MODEL
    → TOOL
    → AGENT
    → WORKFLOW
    → CONFIGURATION
    → RESULT


    --------------------------------------------------
    2. ALWAYS DESIGN AROUND THE ASSISTANT'S PURPOSE
    --------------------------------------------------

    Before designing screens, define:

    1. What is this assistant primarily supposed to help users accomplish?

    2. What are the 3–5 most common user intents?

    3. Which tasks happen frequently?

    4. Which tasks are complex but rare?

    5. Which actions can the assistant safely perform automatically?

    6. Which actions require explicit confirmation?

    7. Which information does the user actually need to see?

    8. Which information exists only because of the system architecture?

    9. Does the user mainly:
       - ask questions?
       - create things?
       - manage tasks?
       - monitor something?
       - communicate?
       - make decisions?
       - execute transactions?
       - collaborate?
       - work with documents?
       - work through long-running processes?

    The answers should determine the UI.

    DO NOT start with:

    "What AI features do we have?"

    Start with:

    "What is the user trying to accomplish?"


    --------------------------------------------------
    3. DIFFERENT ASSISTANTS REQUIRE DIFFERENT UX
    --------------------------------------------------

    Examples:

    A WRITING ASSISTANT may emphasize:
    - text composition
    - editing
    - document context
    - versions
    - tone adjustments
    - export or sharing

    A TRAVEL ASSISTANT may emphasize:
    - itinerary
    - recommendations
    - maps
    - bookings
    - dates
    - confirmation steps
    - ongoing trip support

    A PERSONAL ASSISTANT may emphasize:
    - conversations
    - tasks
    - reminders
    - calendar
    - ongoing context
    - proactive follow-up

    A RESEARCH ASSISTANT may emphasize:
    - sources
    - citations
    - documents
    - comparisons
    - evidence
    - research history

    A BUSINESS OPERATIONS ASSISTANT may emphasize:
    - tasks
    - approvals
    - progress
    - integrations
    - recurring workflows
    - status updates

    A HIGH-RISK ASSISTANT may need substantially more:
    - confirmation
    - explanation
    - review
    - traceability
    - explicit user control

    Therefore:

    DO NOT copy a generic AI chat interface without considering the actual job of the assistant.


    --------------------------------------------------
    4. USER MENTAL MODEL
    --------------------------------------------------

    In most cases, the user should only need to understand four things:

    1. What can I ask the assistant to do?

    2. What is happening right now?

    3. Does the assistant need something from me?

    4. What was the result?

    Everything else is secondary.

    The user usually does NOT need to know:
    - which model is running
    - how many agents are involved
    - which internal tool is being called
    - which API is being used
    - how the orchestration system works
    - which prompt is active
    - how tasks are decomposed internally


    --------------------------------------------------
    5. DEFAULT EXPERIENCE: ONE ASSISTANT
    --------------------------------------------------

    Whenever possible, present:

    ONE assistant
    ONE shared context
    ONE primary entry point

    Text, speech, files, images, tools, and conversation should usually be capabilities of that assistant.

    They should not automatically become separate products or top-level sections.

    The user should be able to naturally move between:

    typing
    → dictating
    → attaching something
    → speaking
    → receiving a result
    → continuing by text

    without mentally switching assistants.


    --------------------------------------------------
    6. THE HOME SCREEN
    --------------------------------------------------

    The home screen should reflect the assistant’s main purpose.

    For a general-purpose assistant, a good default can be:

    A short contextual greeting.

    Example:

    "What can I help you accomplish?"

    Then one primary composer:

    [ + ]  Describe what you want to achieve...  [ microphone ]

    Possible capabilities attached to the composer:
    - text input
    - microphone
    - attachments
    - camera
    - relevant contextual actions

    A separate "Start conversation" action may be appropriate if realtime voice conversation is an important part of the product.

    Below the composer, optionally show a small number of examples.

    Examples should demonstrate possibilities, not create a feature catalog.

    GOOD:

    "Summarize this document"

    "Help me plan my trip"

    "Write a reply"

    "Compare these options"

    BAD:

    20 feature tiles explaining every technical capability.


    --------------------------------------------------
    7. DO NOT TURN INPUT METHODS INTO PRODUCTS
    --------------------------------------------------

    Typing, dictation, file upload, camera input, and voice are usually input mechanisms.

    They are not necessarily different modes of the product.

    For example:

    Typing:
    User enters text into the composer.

    Dictation:
    Speech is converted into text in the same composer.

    Attachment:
    A file is attached to the same task.

    Camera:
    An image becomes context for the same task.

    Voice conversation:
    May temporarily use a dedicated full-screen interaction because the interaction pattern is fundamentally different.

    But the assistant and context should remain the same whenever possible.


    --------------------------------------------------
    8. WHEN A SEPARATE MODE IS JUSTIFIED
    --------------------------------------------------

    Create a separate mode only when the user experience genuinely changes.

    Good reasons:
    - realtime voice interaction
    - camera-first interaction
    - immersive navigation
    - live monitoring
    - a specialized workflow that requires a fundamentally different interface

    Weak reasons:
    - a different model is being used
    - a different tool is being used
    - the backend workflow is different
    - a separate API is involved
    - the engineering architecture has separate services

    The UI should represent differences meaningful to users, not differences meaningful only to developers.


    --------------------------------------------------
    9. INTENT-FIRST INTERACTION
    --------------------------------------------------

    The user should describe the desired outcome.

    Example:

    "Find a good hotel in Lisbon for next weekend under €200."

    The user should NOT have to manually perform:

    Travel
    → Search
    → Hotels
    → Web search
    → Filters
    → Agent
    → Recommendation mode
    → Compare

    The system should infer and coordinate those steps.


    --------------------------------------------------
    10. CORE INTERACTION LOOP
    --------------------------------------------------

    Most workflows should fit into a small number of reusable states:

    1. INTENT

    The user describes what they want.

    ↓

    2. UNDERSTANDING

    The assistant interprets the request.

    If enough information exists:
    continue automatically.

    If critical information is missing:
    ask one focused question.

    ↓

    3. EXECUTION

    The assistant works.

    ↓

    4. STATUS

    Show useful progress.

    Example:

    "Checking available options..."

    "Comparing 8 results..."

    "Preparing your summary..."

    Do not expose internal execution logs.

    ↓

    5. USER DECISION

    Only when required.

    Example:

    "I found three good options. Which one should I use?"

    ↓

    6. RESULT

    Present the output in the most appropriate format.

    ↓

    7. NEXT ACTION

    Offer only the most relevant follow-up actions.


    --------------------------------------------------
    11. PROGRESSIVE DISCLOSURE
    --------------------------------------------------

    The default interface should show only what is currently relevant.

    Use roughly two information levels:

    LEVEL 1 — DEFAULT

    Show:
    - task
    - important result
    - current status
    - required decision
    - primary actions

    LEVEL 2 — DETAILS

    On demand:
    - sources
    - alternatives
    - assumptions
    - execution details
    - advanced options
    - secondary information

    Avoid unnecessary hierarchy such as:

    Details
    → Advanced
    → More
    → Expert
    → System options

    If the user needs four layers of menus to understand the task, the experience is probably too complex.


    --------------------------------------------------
    12. SHOW PROGRESS, NOT INTERNAL REASONING
    --------------------------------------------------

    Useful:

    "Searching for suitable flights..."

    "Found 12 options."

    "Comparing price, duration, and baggage."

    "Almost finished."

    Avoid:

    "Agent 3 started."

    "Calling SearchTool."

    "Executing function."

    "Model X is evaluating output."

    "Sub-agent completed chain 4."

    "Tokens used: 18,492."

    Internal orchestration is implementation detail.


    --------------------------------------------------
    13. RESULT-FIRST DESIGN
    --------------------------------------------------

    Do not assume every assistant response must look like a chat bubble.

    Use the UI that best communicates the result.

    Examples:

    Writing:
    editable document or text

    Travel:
    itinerary

    Comparison:
    comparison card or table

    Scheduling:
    calendar proposal

    Shopping:
    product comparison

    Research:
    summary + sources

    Task execution:
    status card

    Data:
    visualization

    Long-running work:
    task state

    The conversational interface can remain around the result without forcing the result itself into a message bubble.


    --------------------------------------------------
    14. CARDS
    --------------------------------------------------

    Use cards when they improve comprehension.

    Cards should not become decoration.

    A card should normally contain:

    - one clear subject
    - the most important information
    - optional secondary information
    - one primary action
    - possibly one secondary action

    Avoid cards containing:
    - many buttons
    - nested controls
    - multiple unrelated concepts
    - excessive metadata


    --------------------------------------------------
    15. ASK FEWER QUESTIONS
    --------------------------------------------------

    Do not make the assistant behave like a traditional form.

    BAD:

    "What date?"

    "What budget?"

    "Which airline?"

    "Which airport?"

    "Direct flight?"

    "Window seat?"

    "What baggage?"

    Better:

    Infer reasonable defaults where appropriate.

    Then say:

    "I assumed economy class and direct flights where practical."

    [Change]

    Ask questions only when:
    - the answer materially changes the outcome
    - the system cannot safely infer it
    - legal or financial consequences require confirmation
    - user preference is critical


    --------------------------------------------------
    16. MAKE DECISIONS EASY
    --------------------------------------------------

    When user input is required, prepare the decision.

    BAD:

    "What would you like to do?"

    BETTER:

    "I found three suitable options."

    Option A
    €180
    central location

    Option B
    €145
    quieter area

    Option C
    €220
    best rating

    "Which one should I continue with?"

    The system should reduce complexity before presenting it to the user.


    --------------------------------------------------
    17. RISK-BASED CONTROL
    --------------------------------------------------

    Automation should depend on consequences.

    LOW-RISK ACTIONS can often happen automatically.

    Examples:
    - searching
    - summarizing
    - organizing
    - drafting
    - comparing
    - researching
    - creating suggestions
    - analyzing uploaded content

    HIGHER-CONSEQUENCE ACTIONS generally require explicit approval.

    Examples:
    - sending messages
    - publishing content
    - completing a purchase
    - completing a booking
    - transferring money
    - deleting important information
    - modifying accounts
    - sharing sensitive information

    Principle:

    DO NOT request approval for every internal step.

    Request approval at meaningful decision boundaries.


    --------------------------------------------------
    18. REVERSIBILITY
    --------------------------------------------------

    Whenever possible:

    Prefer easy undo over excessive confirmation.

    Example:

    "Event moved to Friday."

    [Undo]

    This can be better than showing confirmation dialogs before every reversible action.

    For irreversible or high-impact actions, explicit confirmation remains appropriate.


    --------------------------------------------------
    19. TASKS VS. CHAT MESSAGES
    --------------------------------------------------

    Do not automatically organize the whole product around individual chat threads.

    Depending on the assistant, the better unit may be:

    - task
    - project
    - document
    - trip
    - case
    - conversation
    - workflow
    - request

    Example:

    "Plan Japan trip"

    may internally contain:
    - 25 messages
    - 4 documents
    - 12 searches
    - several agent actions

    But to the user it can remain:

    ONE task:
    "Japan Trip"


    --------------------------------------------------
    20. LONG-RUNNING TASKS
    --------------------------------------------------

    If work takes time, do not trap the user on a loading screen.

    The user should be able to leave.

    Example:

    Trip planning
    "Comparing hotels..."

    [Open]

    Later:

    Trip planning complete
    "5 suitable options found."

    [View result]

    Long-running tasks should remain discoverable and resumable.


    --------------------------------------------------
    21. NAVIGATION
    --------------------------------------------------

    Navigation must be derived from the actual assistant.

    Do not blindly copy this example.

    For a general assistant, possible top-level areas might be:

    Home

    Activity

    Profile

    But another assistant might require:

    Home

    Trips

    Bookings

    or:

    Projects

    Documents

    Activity

    or:

    Inbox

    Tasks

    Calendar

    Top-level navigation should represent persistent user concepts.

    It should generally NOT represent:
    - models
    - agents
    - tools
    - APIs
    - prompting modes
    - backend services

    Do not put "Writing", "Speech", "Files", "Web", "Tools", and "Agents" into navigation simply because the system supports them.


    --------------------------------------------------
    22. VOICE / CONVERSATION
    --------------------------------------------------

    Realtime conversation can justify a dedicated full-screen state.

    Keep it minimal.

    Possible elements:

    - listening state
    - speaking state
    - processing state
    - stop
    - mute
    - switch to keyboard
    - end conversation
    - optional transcript

    Do not create a completely separate product context.

    The user should be able to end voice mode and continue the same task using text.


    --------------------------------------------------
    23. FILES
    --------------------------------------------------

    Files should usually enter through the context of a task.

    Example:

    [+] Attach

    Then:

    "Summarize this."

    The user should not necessarily need to open:

    Files
    → PDF
    → Analyze
    → Select analyzer
    → Choose model
    → Start

    unless file management itself is one of the application's core jobs.


    --------------------------------------------------
    24. ERRORS
    --------------------------------------------------

    Errors should preserve context.

    GOOD:

    "I couldn't access this file."

    [Try again]

    [Choose another file]

    BAD:

    "Something went wrong."

    and returning the user to Home.

    If the assistant misunderstood something:

    [Change]

    [Try again]

    [That's not what I meant]

    Do not force a complete restart.


    --------------------------------------------------
    25. ONBOARDING
    --------------------------------------------------

    Do not explain the entire AI system before the user can use it.

    Prefer:

    "Tell me what you want to accomplish."

    Then a few meaningful examples.

    Request permissions when they become relevant.

    Example:

    Ask for microphone permission when the user first tries voice.

    Do not request:
    - microphone
    - photos
    - contacts
    - location
    - calendar
    - notifications

    all at initial launch unless the specific product genuinely requires them immediately.


    --------------------------------------------------
    26. SETTINGS
    --------------------------------------------------

    Advanced configuration belongs in Settings, not on Home.

    Depending on the assistant:

    Settings may include:
    - account
    - language
    - voice
    - privacy
    - notifications
    - integrations
    - connected services
    - personalization
    - data controls
    - advanced options

    A normal user should ideally be able to accomplish the assistant's main job without configuring these first.


    --------------------------------------------------
    27. LANGUAGE
    --------------------------------------------------

    Use language based on user actions and outcomes.

    GOOD:

    Send

    Change

    Continue

    Review

    Try again

    Start conversation

    View details

    BAD:

    Execute agent

    Invoke tool

    Run workflow

    Select LLM

    Start autonomous pipeline

    Use terminology the user understands in the context of the job.


    --------------------------------------------------
    28. DO
    --------------------------------------------------

    DO:

    - design around the specific assistant's purpose
    - identify the primary user intents first
    - keep the main interaction simple
    - use sensible defaults
    - keep one shared context when possible
    - unify text, speech, and attachments where appropriate
    - show useful status
    - surface decisions only when needed
    - use progressive disclosure
    - make results editable
    - make actions reversible when possible
    - preserve context after errors
    - make long-running tasks resumable
    - reveal sources or details when they matter
    - use domain-specific UI where it improves understanding
    - let the assistant handle orchestration internally
    - design for the consequences of actions
    - optimize for user goals rather than backend architecture


    --------------------------------------------------
    29. DON'T
    --------------------------------------------------

    DON'T:

    - expose system architecture by default
    - turn every AI capability into a navigation item
    - create a mode for every model or tool
    - force users to choose agents
    - force users to choose models
    - make users configure workflows before using the app
    - expose raw execution logs
    - expose internal reasoning
    - ask for information that can safely be inferred
    - interrupt every step with confirmation
    - overload Home with feature cards
    - create deeply nested menus
    - stack modal sheets unnecessarily
    - create separate contexts for text and voice without a strong reason
    - make files a separate mode unless files are the core product
    - display every possible action simultaneously
    - design screens around what the backend can do
    - assume a generic chatbot UI is appropriate for every assistant


    --------------------------------------------------
    30. FEATURES THAT SHOULD NOT EXIST BY DEFAULT
    --------------------------------------------------

    Do not automatically build these just because the backend supports them:

    - Agent marketplace
    - Agent selector
    - Model selector
    - Tool selector
    - Workflow builder
    - Prompt builder
    - Multi-agent visualization
    - Execution console
    - Raw tool logs
    - Separate web-search mode
    - Separate analysis mode
    - Separate file-analysis mode
    - Separate image mode
    - Separate reasoning mode
    - large AI feature dashboards

    Any of these may be valid for a specialized assistant.

    But they must be justified by the USER CASE.

    Never expose technical complexity simply because it exists.


    --------------------------------------------------
    31. RULE FOR ADDING A UI ELEMENT
    --------------------------------------------------

    Before adding any UI element, ask:

    1. Does the user need to know this?

    If no:
    keep it in the background.

    2. Does the user need to act on it?

    If no:
    do not make it prominent.

    3. Is this frequently needed?

    If no:
    use progressive disclosure.

    4. Is this a user concept or a system concept?

    If it is only a system concept:
    do not expose it by default.

    5. Can the assistant reasonably handle this automatically?

    If yes:
    do not turn it into user configuration.

    6. Does this belong to this specific assistant's purpose?

    If no:
    do not add it just because another AI product has it.


    --------------------------------------------------
    32. RULE FOR CREATING A NEW SCREEN
    --------------------------------------------------

    Every screen should have one dominant purpose.

    Examples:

    Home:
    "What do you want to accomplish?"

    Working:
    "What is happening?"

    Decision:
    "What does the assistant need from me?"

    Result:
    "What was accomplished?"

    Follow-up:
    "What can I do next?"

    If one screen tries to answer all of these simultaneously, simplify it.


    --------------------------------------------------
    33. REUSABLE PRODUCT STATES
    --------------------------------------------------

    Many assistants can be built around a small state system.

    Possible states:

    IDLE
    User can initiate something.

    INPUT
    User is typing, speaking, uploading, or adding context.

    WORKING
    Assistant is executing.

    NEEDS INPUT
    Assistant needs one decision or missing piece of information.

    RESULT
    Assistant completed the requested work.

    ERROR
    Something failed and recovery is available.

    These states are reusable.

    Their presentation should be adapted to the assistant.

    For example:

    A writing assistant's RESULT may be an editable document.

    A travel assistant's RESULT may be an itinerary.

    A data assistant's RESULT may be a chart.

    A scheduling assistant's RESULT may be a calendar proposal.


    --------------------------------------------------
    34. SHARED CONTEXT
    --------------------------------------------------

    Where technically possible, all interaction methods should operate on the same underlying session/context.

    The user should be able to:

    type
    → speak
    → attach a document
    → switch to realtime conversation
    → return to text
    → continue the same task

    without thinking about technical mode changes.

    The assistant remains the same.

    Only the interaction channel changes.


    --------------------------------------------------
    35. MVP SCOPE
    --------------------------------------------------

    Do NOT define the MVP from a generic AI feature checklist.

    Define it from the minimum experience required to fulfill the assistant's core purpose.

    For a general-purpose assistant, an MVP might include:

    HOME
    - main composer
    - text
    - microphone
    - attachments
    - conversation entry
    - a few contextual suggestions

    ASSISTANT / TASK VIEW
    - conversation
    - results
    - contextual actions
    - composer

    VOICE VIEW
    - realtime voice interaction

    ACTIVITY
    - ongoing tasks
    - completed tasks

    SETTINGS
    - relevant preferences
    - privacy
    - integrations

    For a specialized assistant, this structure may be completely different.

    That is expected.


    --------------------------------------------------
    36. DESIGN PRIORITY
    --------------------------------------------------

    When there is a conflict between:

    showing everything the system can do

    and

    keeping the user's task simple

    prefer the simple task experience.

    Capabilities can remain accessible through context, commands, suggestions, or progressive disclosure.

    The UI does not need to advertise the architecture.


    --------------------------------------------------
    37. FINAL PRODUCT PRINCIPLE
    --------------------------------------------------

    The objective is NOT:

    "Make a minimal AI interface."

    The objective is:

    "Create the simplest interface that still fully supports the specific assistant's job."

    Minimalism must never remove necessary:
    - information
    - context
    - safety
    - transparency
    - user control

    At the same time, technical complexity should never be exposed without a user-facing reason.

    The user should understand:

    WHAT is happening.

    WHAT has been completed.

    WHAT still needs attention.

    WHEN their approval is required.

    WHAT they can change.

    They should not need to understand:

    HOW the AI system is internally constructed.


    --------------------------------------------------
    38. SHORT VERSION FOR THE DESIGN TEAM
    --------------------------------------------------

    DESIGN THE USER'S JOB, NOT THE AI SYSTEM.

    Different assistants require different interfaces.

    Start with the assistant's purpose and primary user intents.

    Keep models, tools, agents, orchestration, and workflows in the background unless exposing them directly helps the user accomplish the task.

    Use progressive disclosure.

    Automate low-risk complexity.

    Ask for user input only at meaningful decision points.

    Keep context continuous across text, speech, files, and conversation where appropriate.

    Expose outcomes, status, and control — not architecture.

    The correct UI is the simplest UI that makes this specific assistant useful, understandable, safe, and controllable.
