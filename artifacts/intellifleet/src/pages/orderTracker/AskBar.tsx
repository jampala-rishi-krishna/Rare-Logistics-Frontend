// The black "Ask about any order" panel at the top of the Order Tracker page (approved design,
// docs/design/order-tracker/Desktop___Orders___order_details.png). Sending hands the question to the page, which switches
// to the Ask view; nothing is requested from here.
import { useState } from "react";
import { MessageCircleQuestion, Send } from "lucide-react";
import "./askbar.css";

export const ASK_SUGGESTIONS = [
  "Where is my truck now?",
  "Which orders were rejected today?",
  "Show proof of delivery",
  "Buyers per SKU tomorrow",
  "Unpaid orders this week",
];

export function AskBar({ onAsk }: { onAsk: (question: string) => void }) {
  const [question, setQuestion] = useState("");
  const ready = question.trim().length >= 3;
  function send(text: string) {
    const q = text.trim();
    if (q.length < 3) return;
    onAsk(q);
  }
  return <section className="ota" aria-label="Ask about any order">
    <form onSubmit={e => { e.preventDefault(); send(question); }}>
      <label className="ota-label" htmlFor="ota-question"><MessageCircleQuestion size={18} aria-hidden="true" />Ask about any order — English or Tagalog</label>
      <div className="ota-row">
        <input id="ota-question" className="ota-input" type="text" value={question} maxLength={1000} autoComplete="off"
          onChange={e => setQuestion(e.target.value)}
          placeholder="e.g. Was my order paid in full?  ·  Nasaan na ang truck ko?" />
        <button className="ota-send" type="submit" disabled={!ready}><Send size={20} strokeWidth={2.2} aria-hidden="true" />Ask</button>
      </div>
    </form>
    <div className="ota-chips" role="group" aria-label="Suggested questions">
      {ASK_SUGGESTIONS.map(q => <button type="button" className="ota-chip" key={q} onClick={() => { setQuestion(q); send(q); }}>{q}</button>)}
    </div>
  </section>;
}
