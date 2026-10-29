export type QuestionId = 'Q01'|'Q02'|'Q03'|'Q04'|'Q05'|'Q06'|'Q07'|'Q08'|'Q09'|'Q10'|'Q11'|'Q12'|'Q13'|'Q14'|'Q15'|'Q16'|'Q17'|'Q18';
export type DomainId = 'emotional-openness'|'conflict-resolution'|'shared-life-coordination'|'family-interaction'|'personal-autonomy'|'future-planning';
export type LikertValue = 1|2|3|4|5;
export type ScoreBand = 'low'|'middle'|'high';
type QuestionBase = {readonly id:QuestionId;readonly domainId:DomainId;readonly prompt:string};
export type ScenarioOption = {readonly code:string;readonly label:string;readonly score:1|3|5};
export type MatchTestQuestion = QuestionBase & (
 {readonly kind:'scenario';readonly options:readonly ScenarioOption[]} | {readonly kind:'agreement'}
);
export type MatchTestAnswer = {readonly kind:'scenario';readonly optionId:string}|{readonly kind:'agreement';readonly value:LikertValue};
export type MatchTestAnswers = Readonly<Record<QuestionId,MatchTestAnswer>>;
export type AnswerEvidence = {readonly questionId:QuestionId;readonly score:LikertValue;readonly answer:MatchTestAnswer};
export type DomainScore = {
 readonly domainId:DomainId;readonly rawScore:number;readonly normalizedScore:number;readonly displayScore:number;readonly band:ScoreBand;
 readonly adjustedScores:readonly AnswerEvidence[];
};
export type MatchTestScoringResult = {readonly ok:true;readonly domainScores:readonly DomainScore[]}|{readonly ok:false;readonly error:'invalid-answers'};
