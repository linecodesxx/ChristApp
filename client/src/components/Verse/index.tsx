'use client';

import { useEffect, useState } from "react";
import styles from "./Verse.module.scss";




type VerseProps = {
  verse: number;
  text: string;
};

export default function Verse({ verse, text }: VerseProps) {
  const [isClicked, setIsClicked] = useState(false);

  const handleClick = () => {
    setIsClicked(!isClicked);
  };
  
  useEffect(() => {
    if (verse === 1) {
      const fontSize = "18px";
    }
  })

  return (
  <div className={styles.verseContainer}>
    <p
      className={styles.verse}
      onClick={handleClick}
      style={{
        borderBottom: isClicked ? "2px dashed #C4A265" : "none",
      }}
    >
      <span
        style={{
          fontSize: verse === 1 ? "40px" : "14px",
          color: "rgba(196, 162, 101,1)",
        }}
      >
        {verse}
      </span>{" "}
      {text}
    </p>
  </div>
);

}