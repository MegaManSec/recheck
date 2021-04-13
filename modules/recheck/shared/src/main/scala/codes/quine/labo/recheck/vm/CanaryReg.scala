package codes.quine.labo.recheck.vm

/** CanaryReg is a register reference for canary checking. */
final case class CanaryReg(index: Int) {
  override def toString: String = s"%%$index"
}
