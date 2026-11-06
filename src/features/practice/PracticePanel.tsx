import { Link } from 'react-router-dom';
import { questionsForModel } from '../../content/questions';
import { QuestionCard } from './QuestionCard';
import { Icon } from '../../components/Icon';

export function PracticePanel({ modelId }: { modelId: 'p01' | 'p02' | 'p03' | 'p04' | 'p05' | 'p06' | 'p07' | 'p08' | 'i01' | 'i02' | 'i03' | 'i04' | 'i05' | 'i06' | 'i07' | 'i08' }) {
  const questions = questionsForModel(modelId);
  return (
    <div className="practice-panel">
      <div className="panel-intro">
        <div>
          <h2>随堂练习</h2>
          <p>原创题，答案与物理引擎已核对。作答记录只保存在本机。</p>
        </div>
        <Link className="text-link" to={`/practice?model=${modelId}`}>
          打开完整题库
          <Icon name="arrowRight" size={16} />
        </Link>
      </div>
      {questions.map((question) => (
        <QuestionCard key={question.id} question={question} compact />
      ))}
    </div>
  );
}
