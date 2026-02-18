import styles from "./Verse.module.scss";

type VerseProps = {
  verse: number;
  text: string;
};

export default function Verse({ verse, text }: VerseProps) {
  return (
    <p className={styles.verse}>
      <strong>{verse}.</strong> {text}
    </p>
  );
}